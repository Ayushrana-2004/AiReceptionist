import { TransferDestinationType } from './enums';

/**
 * Routing rule configuration.
 */
export interface RoutingRule {
  id: string;
  businessId: string;
  intentCategory: string;
  priority: number;
  destinations: TransferDestination[];  // max 3, priority-ordered
  isActive: boolean;
}

/**
 * Transfer destination within a routing rule.
 */
export interface TransferDestination {
  type: TransferDestinationType;
  target: string;                // phone number or SIP URI
  label: string;                 // e.g., "Sales Team"
  timeoutSeconds: number;        // default 15
}
