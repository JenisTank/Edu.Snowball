import { Global, Module } from '@nestjs/common';

import { PdfService } from './pdf.service';

/** Browser-free PDF rendering for receipts and certificates. */
@Global()
@Module({
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
