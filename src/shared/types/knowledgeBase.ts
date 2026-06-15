import { KBCategory, Language } from './enums';

/**
 * Knowledge Base entry.
 */
export interface KBEntry {
  id: string;
  businessId: string;
  category: KBCategory;
  question: string;              // max 200 chars
  answer: string;                // max 2000 chars
  language: Language;            // default 'en'
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
}
