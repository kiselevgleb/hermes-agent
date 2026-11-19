import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { asBigint, money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { LIST_PLAYERS_AFTER_SQL, LIST_PLAYERS_SQL } from '../wallets/sql';
import { PlayerListDto, PlayerResponseDto, WalletResponseDto } from './dto/player.dto';

type PlayerRow = {
  id: string;
  name: string;
  created_at: Date | string;
  wallet_id: string;
  balance: string;
};

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string): Promise<PlayerResponseDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const player = await tx.player.create({ data: { name } });
      const wallet = await tx.wallet.create({ data: { playerId: player.id, balance: 0n, version: 0 } });
      return { player, wallet };
    });

    return {
      id: created.player.id,
      name: created.player.name,
      createdAt: created.player.createdAt.toISOString(),
      wallet: {
        id: created.wallet.id,
        balance: money(created.wallet.balance),
        version: created.wallet.version,
      },
    };
  }

  async wallet(playerId: string): Promise<WalletResponseDto> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { wallet: true },
    });
    if (!player) {
      throw new NotFoundException('player not found');
    }
    if (!player.wallet) {
      throw new NotFoundException('wallet not found');
    }
    return {
      id: player.wallet.id,
      playerId: player.id,
      balance: money(player.wallet.balance),
      version: player.wallet.version,
    };
  }

  async list(cursor: string | undefined, limit: number): Promise<PlayerListDto> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    const take = limit + 1;
    const rows = cursor
      ? await this.pageAfter(cursor, take)
      : await this.prisma.$queryRawUnsafe<PlayerRow[]>(LIST_PLAYERS_SQL, take);

    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: iso(row.created_at),
        walletId: row.wallet_id,
        balance: money(asBigint(row.balance)),
      })),
      limit,
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  private async pageAfter(cursor: string, take: number): Promise<PlayerRow[]> {
    const anchor = await this.prisma.player.findUnique({ where: { id: cursor }, select: { id: true } });
    if (!anchor) {
      throw new BadRequestException('unknown cursor');
    }
    return this.prisma.$queryRawUnsafe<PlayerRow[]>(LIST_PLAYERS_AFTER_SQL, cursor, take);
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
