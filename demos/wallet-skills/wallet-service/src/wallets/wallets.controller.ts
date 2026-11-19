import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BetDto, DepositDto, MoneyResponseDto, RollbackDto, WinDto } from './dto/money.dto';
import { WalletsService } from './wallets.service';

const walletId = new ParseUUIDPipe({ version: '4' });

@ApiTags('wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Post(':id/deposit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Credit a wallet. The same externalId returns the original result.' })
  @ApiOkResponse({ type: MoneyResponseDto })
  deposit(@Param('id', walletId) id: string, @Body() dto: DepositDto): Promise<MoneyResponseDto> {
    return this.wallets.deposit(id, dto.externalId, dto.amount);
  }

  @Post(':id/bet')
  @HttpCode(200)
  @ApiOperation({ summary: 'Debit a wallet for a bet.' })
  @ApiOkResponse({ type: MoneyResponseDto })
  bet(@Param('id', walletId) id: string, @Body() dto: BetDto): Promise<MoneyResponseDto> {
    return this.wallets.bet(id, dto.externalId, dto.amount);
  }

  @Post(':id/win')
  @HttpCode(200)
  @ApiOperation({ summary: 'Credit a win that references a bet.' })
  @ApiOkResponse({ type: MoneyResponseDto })
  win(@Param('id', walletId) id: string, @Body() dto: WinDto): Promise<MoneyResponseDto> {
    return this.wallets.win(id, dto.externalId, dto.amount, dto.betExternalId);
  }

  @Post(':id/rollback')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reverse a deposit, bet, or win. A second rollback of the same original is rejected.' })
  @ApiOkResponse({ type: MoneyResponseDto })
  rollback(@Param('id', walletId) id: string, @Body() dto: RollbackDto): Promise<MoneyResponseDto> {
    return this.wallets.rollback(id, dto.externalId, dto.originalExternalId);
  }
}
