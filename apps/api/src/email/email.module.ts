import { Global, Module } from "@nestjs/common";
import { EmailService } from "./email.service.js";

// Global: EmailService disponible en cualquier módulo (auth, iam…) sin re-importar.
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
