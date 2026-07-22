import { Controller, Get, Post, UseGuards } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  ok() {
    return { ok: true };
  }

  @Post("ready")
  @UseGuards()
  ready() {
    return { ready: true };
  }
}
