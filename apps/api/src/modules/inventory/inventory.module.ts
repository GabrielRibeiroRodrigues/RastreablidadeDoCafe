import { Module } from '@nestjs/common';
import { DocumentNumberService } from './document-number.service.js';
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
    DocumentNumberService,
    LotsService,
    ReceiptsService,
    MovementsService,
    StockService,
  ],
  // Produção e expedição (Semana 3) reutilizam o razão, os códigos e a numeração de documentos.
  exports: [StockLedgerService, LotCodeService, DocumentNumberService, LotsService],
})
export class InventoryModule {}
