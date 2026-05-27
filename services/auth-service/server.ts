import { app } from './src/app';
import { env } from './src/config/env';

async function start(): Promise<void> {
  app.listen(env.PORT, () => {
    console.warn(`Auth service listening on port ${env.PORT}`);
  });
}

start().catch((err: unknown) => {
  console.error('Failed to start auth service:', err);
  process.exit(1);
});
