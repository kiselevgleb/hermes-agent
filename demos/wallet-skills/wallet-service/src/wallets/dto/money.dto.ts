import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { TxType } from '../ledger';

export class DepositDto {
  @ApiProperty({ example: 'dep-1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  externalId!: string;

  @ApiProperty({ example: 1000, description: 'Amount in cents' })
  @IsInt()
  @Min(1)
  amount!: number;
}

export class BetDto extends DepositDto {}

export class WinDto extends DepositDto {
  @ApiProperty({ example: 'bet-1', description: 'externalId of the bet this win settles' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  betExternalId!: string;
}

export class RollbackDto {
  @ApiProperty({ example: 'rb-1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  externalId!: string;

  @ApiProperty({ example: 'bet-1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  originalExternalId!: string;
}

export class MoneyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  walletId!: string;

  @ApiProperty()
  externalId!: string;

  @ApiProperty({ enum: ['deposit', 'bet', 'win', 'rollback'] })
  type!: TxType;

  @ApiProperty({ description: 'Amount in cents applied by this operation' })
  amount!: number;

  @ApiProperty({ description: 'Wallet balance in cents immediately after this operation' })
  balanceAfter!: number;

  @ApiProperty({ description: 'True when this externalId was already applied and the balance did not move' })
  idempotentReplay!: boolean;
}
