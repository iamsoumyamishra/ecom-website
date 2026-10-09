import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { ZodError } from "zod";
import type { Response, Request } from "express";
@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    let status = 500,
      message = "The service could not complete this request.";
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      message =
        typeof body === "string"
          ? body
          : ((body as { message?: string }).message ?? "Request failed");
    } else if (error instanceof ZodError) {
      status = 400;
      message = error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } else if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      status = 409;
      message = "This record already exists.";
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      status = 404;
      message = "Record not found";
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2003"
    ) {
      status = 400;
      message = "A related record does not exist";
    }
    res.status(status).json({
      statusCode: status,
      message,
      requestId: res.getHeader("X-Request-Id") ?? req.headers["x-request-id"],
    });
  }
}
