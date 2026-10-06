import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { prismaOptions } from './prisma-options';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super(prismaOptions());
  }

  async onModuleInit() {
    await this.$connect();
  }
}
