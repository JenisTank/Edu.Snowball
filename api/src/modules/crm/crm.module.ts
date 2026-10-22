import { Module } from '@nestjs/common';

import { AreasController } from './areas.controller';
import { LeadsController, LeadsListController } from './leads.controller';

/** First Buzz CRM: enquiry pipeline, area routing and lead activities. */
@Module({ controllers: [LeadsListController, LeadsController, AreasController] })
export class CrmModule {}
