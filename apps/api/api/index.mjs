// Función serverless de Vercel para la API NestJS (ESM).
// Importa el bundle YA COMPILADO por tsc (dist/serverless.js), que conserva la
// metadata de decoradores (emitDecoratorMetadata) — esbuild la eliminaría y rompería
// la inyección de dependencias de Nest. La app se inicializa una sola vez.
import { createServer } from "../dist/serverless.js";

let ready;

export default async function handler(req, res) {
  if (!ready) ready = createServer();
  const app = await ready;
  app(req, res);
}
