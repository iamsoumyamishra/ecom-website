import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags, ApiBody } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { CartsService } from "./carts.service.js";
@ApiTags("cart")
@Controller("api/v1/cart")
export class CartsController {
  constructor(@Inject(CartsService) readonly carts: CartsService) {}
  @Get() async get(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.carts.read((await this.carts.identify(req, res)).id);
  }
  @Post("items")
  @ApiBody({
    schema: {
      type: "object",
      required: ["variantId", "quantity"],
      properties: {
        variantId: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
  })
  async add(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    return this.carts.add((await this.carts.identify(req, res)).id, body);
  }
  @Patch("items/:id") async update(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.carts.update(
      (await this.carts.identify(req, res)).id,
      id,
      body,
    );
  }
  @Delete("items/:id") async remove(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id") id: string,
  ) {
    return this.carts.remove((await this.carts.identify(req, res)).id, id);
  }
  @Post("merge") merge(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.carts.merge(req, res);
  }
}
