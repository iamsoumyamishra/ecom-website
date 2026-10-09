import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Runtime } from "./common/runtime.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { CatalogController } from "./modules/catalog/catalog.controller.js";
import { CartsService } from "./modules/carts/carts.service.js";
import { CartsController } from "./modules/carts/carts.controller.js";
import { CheckoutService } from "./modules/checkout/checkout.service.js";
import { CheckoutController } from "./modules/checkout/checkout.controller.js";
import { PaymentsService } from "./modules/payments/payments.service.js";
import { OrdersService } from "./modules/orders/orders.service.js";
import { OrdersController } from "./modules/orders/orders.controller.js";
import { AdminController } from "./modules/admin/admin.controller.js";
import { MediaService } from "./modules/media/media.service.js";
import { UsersController } from "./modules/users/users.controller.js";
import { JobsService } from "./jobs/jobs.service.js";
@ApiTags("health")
@Controller("api/health")
class HealthController {
  constructor(@Inject(Runtime) readonly r: Runtime) {}
  @Get("live") live() {
    return { status: "ok" };
  }
  @Get("ready") async ready() {
    try {
      await Promise.all([this.r.db.$queryRaw`SELECT 1`, this.r.redis.ping()]);
      return { status: "ready" };
    } catch {
      throw new ServiceUnavailableException("Dependencies unavailable");
    }
  }
}
@Module({
  controllers: [
    HealthController,
    CatalogController,
    CartsController,
    CheckoutController,
    OrdersController,
    AdminController,
    UsersController,
  ],
  providers: [
    Runtime,
    AuthService,
    CatalogService,
    CartsService,
    CheckoutService,
    PaymentsService,
    OrdersService,
    MediaService,
    JobsService,
  ],
})
export class AppModule {}
