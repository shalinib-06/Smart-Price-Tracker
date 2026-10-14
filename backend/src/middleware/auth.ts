import { Request, Response, NextFunction } from 'express';

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = (req.headers['x-api-key'] as string) ?? (req.query.api_key as string);
  if (!key || key !== process.env.API_KEY) {
    res.status(401).json({ error: 'Unauthorized - provide a valid X-Api-Key header' });
    return;
  }
  next();
}

export function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-internal-key'] as string;
  if (!key || key !== process.env.API_KEY) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }
  next();
}
