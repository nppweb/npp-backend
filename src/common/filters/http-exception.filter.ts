import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import { Logger } from "nestjs-pino";

@Catch()
export class HttpExceptionLoggingFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const contextType = host.getType();
    const message = exception instanceof Error ? exception.message : "Unknown error";

    this.logger.error(
      {
        contextType,
        err: exception
      },
      message
    );

    if (contextType !== "http") {
      return;
    }

    const http = host.switchToHttp();
    const response = http.getResponse<{ status: (code: number) => { json: (body: unknown) => void } }>();
    const request = http.getRequest<{ url?: string; method?: string; id?: string }>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        message,
        path: request.url,
        method: request.method,
        requestId: request.id
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      path: request.url,
      method: request.method,
      requestId: request.id
    });
  }
}
