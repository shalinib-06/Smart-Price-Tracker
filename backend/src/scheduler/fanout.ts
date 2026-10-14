import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

// POST /scrape/fanout -- Cloud Scheduler hits this every 15-30 min
router.post('/fanout', async (req: Request, res: Response) => {
  const items = await query(
    'SELECT id FROM tracked_items WHERE deleted_at IS NULL ORDER BY last_checked ASC NULLS FIRST'
  );

  console.log('[fanout] Queuing', items.length, 'items for scraping');

  const useCloudTasks =
    process.env.GCP_PROJECT_ID &&
    process.env.GCP_LOCATION &&
    process.env.CLOUD_TASKS_QUEUE &&
    process.env.WORKER_URL;

  if (useCloudTasks) {
    const { CloudTasksClient } = await import('@google-cloud/tasks');
    const client = new CloudTasksClient();
    const parent = client.queuePath(
      process.env.GCP_PROJECT_ID!,
      process.env.GCP_LOCATION!,
      process.env.CLOUD_TASKS_QUEUE!
    );

    const results = await Promise.allSettled(
      items.map(async (item) => {
        const jitterSeconds = Math.floor(Math.random() * 600);
        const scheduleTime = { seconds: Math.floor(Date.now() / 1000) + jitterSeconds };

        const task = {
          httpRequest: {
            httpMethod: 'POST' as const,
            url: process.env.WORKER_URL!,
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Key': process.env.API_KEY!,
            },
            body: Buffer.from(JSON.stringify({ item_id: item.id })).toString('base64'),
          },
          scheduleTime,
        };

        await client.createTask({ parent, task });
        return item.id;
      })
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    res.json({ queued: succeeded, failed, total: items.length, mode: 'cloud-tasks' });
  } else {
    console.log('[fanout] No Cloud Tasks config - running inline (dev mode)');
    const axios = (await import('axios')).default;
    const workerUrl = `http://localhost:${process.env.PORT ?? 8083}/scrape/work`;

    const results = await Promise.allSettled(
      items.map((item) =>
        axios.post(
          workerUrl,
          { item_id: item.id },
          {
            headers: {
              'X-Internal-Key': process.env.API_KEY ?? '',
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          }
        )
      )
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    res.json({ queued: succeeded, failed, total: items.length, mode: 'inline-dev' });
  }
});

export default router;