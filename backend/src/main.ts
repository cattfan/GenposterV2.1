import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import * as bodyParser from "body-parser";
import { AppModule } from "./app.module";
import { getDb } from "./database/sqlite";

async function bootstrap() {
  // Init DB sớm để fail fast nếu schema sai trước khi listen.
  getDb();
  // Tắt bodyParser default của Nest để mình tự attach với limit cao hơn.
  // Default 100KB không đủ cho bulkPut (e.g. import sheet 5000 quán -> ~3MB JSON).
  const app = await NestFactory.create(AppModule, { cors: true, bodyParser: false });
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix("api/v1");

  // Body parsers cho JSON + urlencoded với limit lớn hơn nhiều default.
  // Multipart (blob upload) đi qua Multer + FileInterceptor riêng, không qua
  // body-parser nên không bị ảnh hưởng.
  app.use(bodyParser.json({ limit: "50mb" }));
  app.use(bodyParser.urlencoded({ limit: "100mb", extended: true }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: false, transform: true }));

  const config = new DocumentBuilder()
    .setTitle("GenPoster Backend")
    .setVersion("0.1.0")
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, doc);

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`Swagger UI: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend:", err);
  process.exit(1);
});
