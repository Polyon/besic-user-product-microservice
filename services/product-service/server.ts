import { app } from './src/app';
import { connectDB } from './src/config/db';
import { env } from './src/config/env';

async function start(): Promise<void> {
  await connectDB();
  app.listen(env.PORT, () => {
    console.warn(`Product service listening on port ${env.PORT}`);
  });
}

start().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

