import { QualificationStatus, CRMSyncStatus } from './enums';

/**
 * Captured lead from a call.
 */
export interface Lead {
  id: string;
  businessId: string;
  callId: string;
  name: string;                  // max 100 chars
  phone: string;
  email: string | null;
  reason: string;                // max 500 chars
  qualificationStatus: QualificationStatus;
  crmSyncStatus: CRMSyncStatus;
  crmRecordId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
