import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreatePlayerDto {
  @ApiProperty({ example: 'alice' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}

export class ListPlayersQuery {
  @ApiProperty({ required: false, description: 'Player id of the last row on the previous page' })
  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class WalletResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  playerId!: string;

  @ApiProperty({ description: 'Current balance in cents' })
  balance!: number;

  @ApiProperty()
  version!: number;
}

export class CreatedWalletDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Current balance in cents' })
  balance!: number;

  @ApiProperty()
  version!: number;
}

export class PlayerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: CreatedWalletDto })
  wallet!: CreatedWalletDto;
}

export class PlayerListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  walletId!: string;

  @ApiProperty()
  balance!: number;
}

export class PlayerListDto {
  @ApiProperty({ type: [PlayerListItemDto] })
  items!: PlayerListItemDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
