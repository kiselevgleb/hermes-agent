import { Global, Module } from '@nestjs/common';
import { LedgerGateway } from '../wallets/ledger.gateway';
import { PrismaLedgerGateway } from '../wallets/prisma-ledger.gateway';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaLedgerGateway,
    { provide: LedgerGateway, useExisting: PrismaLedgerGateway },
  ],
  exports: [PrismaService, LedgerGateway],
})
export class PrismaModule {}
