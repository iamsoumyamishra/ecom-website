import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import { ApiTags, ApiCookieAuth } from "@nestjs/swagger";
import type { Request } from "express";
import { OrdersService } from "./orders.service.js";
import { AuthService } from "../auth/auth.service.js";
@ApiTags("orders")
@ApiCookieAuth()
@Controller("api/v1/orders")
export class OrdersController {
  constructor(
    @Inject(OrdersService) readonly orders: OrdersService,
    @Inject(AuthService) readonly auth: AuthService,
  ) {}
  @Get() async list(@Req() req: Request, @Query("cursor") cursor?: string) {
    return this.orders.list((await this.auth.require(req)).user.id, cursor);
  }
  @Get(":id") async get(@Req() req: Request, @Param("id") id: string) {
    return this.orders.get((await this.auth.require(req)).user.id, id);
  }
}
