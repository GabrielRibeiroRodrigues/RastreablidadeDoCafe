import { Module } from '@nestjs/common';
import { LotCodeService } from './lot-code.service.js';
import { LotsController } from './lots.controller.js';
import { LotsService } from './lots.service.js';
import { MovementsController } from './movements.controller.js';
import { MovementsService } from './movements.service.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptsService } from './receipts.service.js';
import { StockController, StockService } from './stock.controller.js';
import { StockLedgerService } from './stock-ledger.service.js';

/** Lotes, recebimento, razão de estoque e posição de estoque (Semana 2, ADR 0007). */
@Module({
  controllers: [LotsController, ReceiptsController, MovementsController, StockController],
  providers: [
    StockLedgerService,
    LotCodeService,
    LotsService,
    ReceiptsService,
    MovementsService,
    StockService,
  ],
  // A produção (Semana 3) reutiliza o razão e a geração de códigos.
  exports: [StockLedgerService, LotCodeService, LotsService],
})
export class InventoryModule {}
