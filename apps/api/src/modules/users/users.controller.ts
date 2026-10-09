import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { addressInput } from "@commerce/contracts";
import { Runtime } from "../../common/runtime.js";
import { AuthService } from "../auth/auth.service.js";
@ApiTags("profile")
@ApiCookieAuth()
@Controller("api/v1/me")
export class UsersController {
  constructor(
    @Inject(Runtime) readonly r: Runtime,
    @Inject(AuthService) readonly auth: AuthService,
  ) {}
  @Get() async profile(@Req() req: Request) {
    const s = await this.auth.require(req);
    return { id: s.user.id, name: s.user.name, email: s.user.email };
  }
  @Patch() async update(@Req() req: Request, @Body() body: unknown) {
    const s = await this.auth.require(req);
    const data = z
      .object({ name: z.string().trim().min(1).max(100) })
      .strict()
      .parse(body);
    return this.r.db.user.update({
      where: { id: s.user.id },
      data,
      select: { id: true, name: true, email: true },
    });
  }
  @Get("addresses") async addresses(@Req() req: Request) {
    return {
      items: await this.r.db.address.findMany({
        where: { userId: (await this.auth.require(req)).user.id },
        orderBy: { id: "asc" },
        take: 20,
      }),
    };
  }
  @Post("addresses") async add(@Req() req: Request, @Body() body: unknown) {
    const userId = (await this.auth.require(req)).user.id;
    const data = addressInput.parse(body);
    return this.r.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      if ((await tx.address.count({ where: { userId } })) >= 20)
        throw new BadRequestException("Maximum of 20 saved addresses");
      return tx.address.create({ data: { ...data, userId } });
    });
  }
  @Delete("addresses/:id") async remove(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await this.r.db.address.deleteMany({
      where: { id, userId: (await this.auth.require(req)).user.id },
    });
    return { success: true };
  }
}
