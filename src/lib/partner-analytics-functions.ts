import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { ANALYTICS_PRESETS } from './partner-analytics-rules'
import { getPartnerAnalytics } from './partner-analytics-queries'

export const analyticsParamsSchema = z.object({
  preset: z.enum(ANALYTICS_PRESETS),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  calendarEventId: z.uuid().optional(),
})

export type AnalyticsParams = z.infer<typeof analyticsParamsSchema>

export const fetchPartnerAnalytics = createServerFn({ method: 'GET' })
  .validator(analyticsParamsSchema)
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    return getPartnerAnalytics(partner.id, data)
  })
