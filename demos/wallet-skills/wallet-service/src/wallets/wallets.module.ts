import { Module } from '@nestjs/common';
import { HOURLY_BET_LIMIT, WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';

@Module({
  controllers: [WalletsController],
  providers: [
    WalletsService,
    {
      provide: HOURLY_BET_LIMIT,
      useFactory: () => BigInt(process.env.HOURLY_BET_LIMIT ?? '10000000000'),
    },
  ],
})
export class WalletsModule {}
