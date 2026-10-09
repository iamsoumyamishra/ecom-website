import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiBody } from "@nestjs/swagger";
import type { Request } from "express";
import { CheckoutService } from "./checkout.service.js";
import { AuthService } from "../auth/auth.service.js";
@ApiTags("checkout")
@ApiCookieAuth()
@Controller("api/v1/checkout")
export class CheckoutController {
  constructor(
    @Inject(CheckoutService) readonly checkout: CheckoutService,
    @Inject(AuthService) readonly auth: AuthService,
  ) {}
  @Post()
  @ApiBody({
    schema: {
      type: "object",
      required: ["idempotencyKey", "shippingAddress"],
      properties: {
        idempotencyKey: { type: "string", format: "uuid" },
        shippingAddress: { $ref: "#/components/schemas/Address" },
        discountCode: { type: "string" },
      },
      additionalProperties: false,
    },
  })
  async create(@Req() req: Request, @Body() body: unknown) {
    return this.checkout.create((await this.auth.require(req)).user, body);
  }
  @Get("active") async active(@Req() req: Request) {
    return this.checkout.active((await this.auth.require(req)).user.id);
  }
  @Get(":id") async get(@Req() req: Request, @Param("id") id: string) {
    return this.checkout.status((await this.auth.require(req)).user.id, id);
  }
}
