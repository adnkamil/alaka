import { createServerFn } from '@tanstack/react-start'
import { requirePartner } from './partner-auth'
import { getPartnerDashboard } from './partner-dashboard-queries'

export const fetchPartnerDashboard = createServerFn({ method: 'GET' }).handler(
  async () => {
    const partner = await requirePartner()
    return getPartnerDashboard(partner.id)
  },
)
