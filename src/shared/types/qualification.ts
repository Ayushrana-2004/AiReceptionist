import { QualificationCategory } from './enums';

/**
 * Lead qualification criteria configuration.
 */
export interface QualificationCriteria {
  id: string;
  businessId: string;
  category: QualificationCategory;
  values: string[];              // max 10 per category
  weight: number;                // for scoring
}
