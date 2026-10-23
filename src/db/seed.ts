/**
 * Seeds realistic demo data: staff, customers, ~60 days of email inquiries with
 * threaded messages, AI drafts, and orders. Safe to re-run (truncates first).
 */
import { distance } from "fastest-levenshtein";
import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  activityLog,
  aiDrafts,
  customers,
  inquiries,
  messages,
  orders,
  settings,
  users,
  type InquiryStatus,
  type ServiceType,
} from "./schema";
import type { InquiryExtraction } from "@/lib/ai/schemas";
import { defaultSettings, renderTemplate } from "@/lib/settings";
import { inquiryNumber, serviceTypeLabels } from "@/lib/labels";

let seed = 20261022;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
/** Log-normal-ish delay around a median, in minutes. */
const delayAround = (median: number) => Math.max(3, median * Math.exp((rand() - 0.5) * 1.6));
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

const staff = [
  { name: "Dana Whitfield", email: "dana.whitfield@outsourcelogistics.com", role: "admin" as const },
  { name: "Marcus Bell", email: "marcus.bell@outsourcelogistics.com", role: "manager" as const },
  { name: "Renee Calloway", email: "renee.calloway@outsourcelogistics.com", role: "manager" as const },
];

const reps = [
  { name: "Maria Santos", email: "maria.santos@outsourcelogistics.com", medianMinutes: 22, editRate: 0.12 },
  { name: "James Porter", email: "james.porter@outsourcelogistics.com", medianMinutes: 48, editRate: 0.25 },
  { name: "Aisha Grant", email: "aisha.grant@outsourcelogistics.com", medianMinutes: 75, editRate: 0.08 },
  { name: "Tyler Brooks", email: "tyler.brooks@outsourcelogistics.com", medianMinutes: 170, editRate: 0.4 },
  { name: "Kevin Nguyen", email: "kevin.nguyen@outsourcelogistics.com", medianMinutes: 290, editRate: 0.55 },
];

const companies = [
  ["Coastal Furniture Imports", "coastalfurniture.com"],
  ["Peach State Beverages", "peachstatebev.com"],
  ["Lowcountry Paper Co.", "lowcountrypaper.com"],
  ["Altamaha Building Supply", "altamahasupply.com"],
  ["Hilton Head Outdoor", "hhoutdoor.com"],
  ["Brunswick Marine Parts", "brunswickmarine.com"],
  ["Ogeechee Foods", "ogeecheefoods.com"],
  ["Savannah Tile & Stone", "savtile.com"],
  ["Chatham Chemical", "chathamchem.com"],
  ["Magnolia Home Goods", "magnoliahomegoods.com"],
  ["Tybee Apparel", "tybeeapparel.com"],
  ["Southern Steel Fabricators", "southernsteelfab.com"],
  ["Pooler Auto Components", "poolerauto.com"],
  ["Riverfront Coffee Roasters", "riverfrontcoffee.com"],
  ["Golden Isles Electronics", "goldenisleselectronics.com"],
  ["Effingham Packaging", "effpack.com"],
  ["Bulloch Agricultural", "bullochag.com"],
  ["Skidaway Pharma Supply", "skidawaypharma.com"],
  ["Wilmington Island Toys", "witoys.com"],
  ["Rincon Lumber", "rinconlumber.com"],
  ["Statesboro Textiles", "sboro-textiles.com"],
  ["Port Wentworth Plastics", "pwplastics.com"],
] as const;

const firstNames = ["Laura", "Derek", "Priya", "Tom", "Angela", "Chris", "Monique", "Brian", "Elena", "Sam", "Hector", "Jill", "Andre", "Kim", "Victor", "Nadia", "Paul", "Grace", "Omar", "Beth", "Luis", "Tara"];
const lastNames = ["Henley", "Okafor", "Patel", "Riggs", "Moreno", "Lindqvist", "Baptiste", "Carter", "Vasquez", "Doyle", "Ruiz", "Chambers", "Wallace", "Tran", "Kowalski", "Haddad", "Sutton", "Ito", "Farouk", "McAllister", "Ortega", "Bishop"];

type Scenario = {
  serviceType: ServiceType;
  subject: string;
  body: (first: string) => string;
  extraction: Omit<InquiryExtraction, "customerName" | "company" | "phone" | "isCustomerInquiry">;
  orderValue: [number, number];
};

const scenarios: Scenario[] = [
  {
    serviceType: "port_services",
    subject: "Drayage quote - 4x40HC Garden City Terminal",
    body: (f) => `Hi,\n\nWe have 4 x 40' high cube containers arriving at Garden City Terminal on the MSC Letizia next week. Can you quote drayage to our DC in Pooler and let us know your current free time / per diem terms?\n\nCommodity is furniture, roughly 18,000 lbs per box. Not hazmat.\n\nThanks,\n${f}`,
    extraction: { serviceType: "port_services", priority: "high", summary: "Drayage quote for 4x40HC from Garden City Terminal to Pooler DC; asks about free time and per diem.", origin: "Garden City Terminal, Savannah GA", destination: "Pooler, GA", commodity: "Furniture", weight: "18,000 lbs per container", volume: "4 x 40' HC", hazmat: false, foodGrade: false, requestedDate: "Next week", questions: ["What is the drayage rate?", "What are free time and per diem terms?"] },
    orderValue: [2400, 4800],
  },
  {
    serviceType: "warehousing",
    subject: "Need 300 pallet positions starting next month",
    body: (f) => `Hello,\n\nWe're looking for short-term warehousing in the Savannah area for about 300 pallets of packaged beverages. Product is food grade, needs to stay under 85F. We'd need pick/pack for regional retail orders, maybe 40 orders per week.\n\nCan you send storage and handling rates?\n\n${f}`,
    extraction: { serviceType: "warehousing", priority: "normal", summary: "Food-grade storage for ~300 pallets of beverages with weekly pick/pack; wants storage and handling rates.", origin: null, destination: "Savannah area", commodity: "Packaged beverages", weight: null, volume: "300 pallets", hazmat: false, foodGrade: true, requestedDate: "Next month", questions: ["What are storage rates?", "What are handling rates?", "Can you keep product under 85F?"] },
    orderValue: [6000, 14000],
  },
  {
    serviceType: "transloading",
    subject: "Flat rack transload - oversized steel beams",
    body: (f) => `Good morning,\n\nWe have 2 flat racks of fabricated steel beams (approx 52 ft long, 38,000 lbs each) arriving at the Port of Savannah. We need them transloaded to step decks for delivery to a jobsite in Macon. Do you handle oversized flat rack transloading and can you arrange the trucking?\n\nRegards,\n${f}`,
    extraction: { serviceType: "transloading", priority: "high", summary: "Transload 2 flat racks of 52ft steel beams to step decks and deliver to Macon jobsite.", origin: "Port of Savannah", destination: "Macon, GA", commodity: "Fabricated steel beams", weight: "38,000 lbs each", volume: "2 flat racks", hazmat: false, foodGrade: false, requestedDate: null, questions: ["Do you handle oversized flat rack transloading?", "Can you arrange the trucking?"] },
    orderValue: [5500, 9800],
  },
  {
    serviceType: "transportation",
    subject: "FTL Savannah to Charlotte - weekly lane",
    body: (f) => `Hi team,\n\nWe're looking for a carrier for a recurring weekly FTL lane from our Savannah warehouse to Charlotte, NC. Dry van, 22 pallets, about 34,000 lbs. Pickups Tuesdays.\n\nCould you provide a rate and capacity commitment?\n\nThanks!\n${f}`,
    extraction: { serviceType: "transportation", priority: "normal", summary: "Recurring weekly dry van FTL from Savannah to Charlotte NC, 22 pallets, Tuesday pickups.", origin: "Savannah, GA", destination: "Charlotte, NC", commodity: "General merchandise", weight: "34,000 lbs", volume: "22 pallets", hazmat: false, foodGrade: false, requestedDate: "Tuesdays, weekly", questions: ["What is the rate?", "Can you commit capacity weekly?"] },
    orderValue: [1400, 2600],
  },
  {
    serviceType: "warehousing",
    subject: "Hazmat dry storage availability",
    body: (f) => `Hello,\n\nDo you have availability for Class 8 hazmat dry storage? We have roughly 60 pallets of drummed cleaning chemicals arriving in 2 weeks. Need storage for about 90 days.\n\nPlease let me know availability and what documentation you need from us (SDS, etc).\n\n${f}`,
    extraction: { serviceType: "warehousing", priority: "normal", summary: "90-day Class 8 hazmat dry storage for ~60 pallets of drummed chemicals arriving in 2 weeks.", origin: null, destination: null, commodity: "Drummed cleaning chemicals (Class 8)", weight: null, volume: "60 pallets", hazmat: true, foodGrade: false, requestedDate: "In 2 weeks", questions: ["Do you have hazmat storage availability?", "What documentation is needed?"] },
    orderValue: [3800, 7200],
  },
  {
    serviceType: "value_added",
    subject: "Kitting and relabeling for retail launch",
    body: (f) => `Hi there,\n\nWe have a retail launch coming up and need about 12,000 units kitted (3 SKUs into a gift box) and relabeled with retailer-compliant labels. Inbound is 2 x 40' containers. Do you offer this and what's the lead time?\n\nBest,\n${f}`,
    extraction: { serviceType: "value_added", priority: "normal", summary: "Kitting 12,000 gift boxes from 3 SKUs plus retailer relabeling; inbound 2x40' containers.", origin: null, destination: null, commodity: "Consumer goods", weight: null, volume: "12,000 units; 2 x 40' containers", hazmat: false, foodGrade: false, requestedDate: null, questions: ["Do you offer kitting and relabeling?", "What is the lead time?"] },
    orderValue: [7000, 16000],
  },
  {
    serviceType: "port_services",
    subject: "URGENT: container on hold, need pickup tomorrow",
    body: (f) => `We have a 20' container at Ocean Terminal that's about to start accruing demurrage. Customs hold cleared this morning. Can you pick up tomorrow and deliver to Rincon?\n\nPlease call or reply ASAP.\n${f}`,
    extraction: { serviceType: "port_services", priority: "urgent", summary: "Urgent next-day pickup of a 20' container at Ocean Terminal for delivery to Rincon to avoid demurrage.", origin: "Ocean Terminal, Savannah GA", destination: "Rincon, GA", commodity: null, weight: null, volume: "1 x 20'", hazmat: false, foodGrade: false, requestedDate: "Tomorrow", questions: ["Can you pick up tomorrow?"] },
    orderValue: [650, 1200],
  },
  {
    serviceType: "transportation",
    subject: "LTL rates to Jacksonville and Atlanta",
    body: (f) => `Hello,\n\nCan you quote LTL for 6 pallets (2,800 lbs total) from Savannah to Jacksonville, FL and a separate 4 pallet shipment to Atlanta? Liftgate needed at Atlanta delivery.\n\nThank you,\n${f}`,
    extraction: { serviceType: "transportation", priority: "low", summary: "LTL quotes: 6 pallets Savannah to Jacksonville and 4 pallets to Atlanta with liftgate.", origin: "Savannah, GA", destination: "Jacksonville, FL; Atlanta, GA", commodity: null, weight: "2,800 lbs", volume: "6 pallets + 4 pallets", hazmat: false, foodGrade: false, requestedDate: null, questions: ["What are the LTL rates?"] },
    orderValue: [450, 1100],
  },
];

const repReplies = [
  (first: string, s: Scenario) => `Hi ${first},\n\nThanks for reaching out. We can absolutely help with this ${serviceTypeLabels[s.serviceType].toLowerCase()} request. I've attached our rate sheet and can hold capacity for your requested dates once you confirm.\n\nA couple of quick questions so I can finalize pricing:\n- Can you confirm the exact pickup/arrival date?\n- Are there any special handling requirements?\n\nBest regards,`,
  (first: string) => `Hi ${first},\n\nAppreciate you thinking of Outsource Logistics. I've reviewed the details and we have availability. Pricing is attached; let me know if you'd like to book and I'll get it scheduled today.\n\nThanks,`,
];

const customerFollowUps = [
  "Thanks, this looks good. Can we book it?",
  "Rates look reasonable. Can you confirm availability for the date we discussed?",
  "Could you clarify the accessorial charges before we approve?",
];

async function main() {
  console.log("Truncating tables...");
  await db.execute(
    sql`TRUNCATE activity_log, messages, ai_drafts, orders, inquiries, customers, users, settings RESTART IDENTITY CASCADE`,
  );
  await db.execute(sql`ALTER SEQUENCE inquiries_number_seq RESTART WITH 1001`);
  await db.execute(sql`ALTER SEQUENCE orders_number_seq RESTART WITH 5001`);

  const staffRows = await db.insert(users).values(staff).returning();
  const repRows = await db
    .insert(users)
    .values(reps.map(({ name, email }) => ({ name, email, role: "rep" as const })))
    .returning();
  const repProfile = new Map(repRows.map((r, i) => [r.id, reps[i]]));

  const customerRows = await db
    .insert(customers)
    .values(
      companies.map(([company, domain], i) => {
        const first = firstNames[i % firstNames.length];
        const last = lastNames[i % lastNames.length];
        return {
          name: `${first} ${last}`,
          company,
          email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
          phone: `(912) 555-${String(1000 + i * 37).slice(0, 4)}`,
          ownerId: repRows[i % repRows.length].id,
        };
      }),
    )
    .returning();

  await db.insert(settings).values(
    (Object.keys(defaultSettings) as (keyof typeof defaultSettings)[]).map((key) => ({
      key,
      value: defaultSettings[key],
    })),
  );

  const now = new Date();
  const mailbox = process.env.GRAPH_MAILBOX ?? "quotes@outsourcelogistics.com";
  const ack = defaultSettings.ackTemplate;
  const model = defaultSettings.ai.model;
  let created = 0;

  for (let i = 0; i < 190; i++) {
    // The first batch lands in the last few hours so the queue has live, unanswered work.
    const recent = i < 18;
    const daysAgo = recent ? between(0.01, 0.4) : Math.pow(rand(), 1.3) * 60;
    const received = new Date(now.getTime() - daysAgo * 86_400_000);
    if (!recent) {
      received.setHours(Math.floor(between(7, 17)), Math.floor(between(0, 59)), 0, 0);
      if (received > now) received.setTime(now.getTime() - between(10, 300) * 60_000);
    }

    const customer = pick(customerRows);
    const repId = rand() < 0.75 ? customer.ownerId! : pick(repRows).id;
    const rep = repRows.find((r) => r.id === repId)!;
    const profile = repProfile.get(repId)!;
    const scenario = pick(scenarios);
    const first = customer.name.split(" ")[0];
    const conversationId = `seed-conv-${i}`;
    const ageMinutes = (now.getTime() - received.getTime()) / 60_000;

    const replyDelay = delayAround(profile.medianMinutes);
    const replied = ageMinutes > replyDelay && !(recent && rand() < 0.6);
    const firstResponseAt = replied ? addMinutes(received, replyDelay) : null;
    const ackAt = addMinutes(received, between(0.5, 2));

    let status: InquiryStatus = replied ? "responded" : rand() < 0.8 ? "draft_ready" : "new";
    const convert = replied && rand() < 0.48 && daysAgo > 1;
    const closeLost = replied && !convert && daysAgo > 10 && rand() < 0.35;
    if (convert) status = "converted";
    else if (closeLost) status = "closed";

    const extracted: InquiryExtraction = {
      ...scenario.extraction,
      isCustomerInquiry: true,
      customerName: customer.name,
      company: customer.company,
      phone: customer.phone,
    };

    const [inq] = await db
      .insert(inquiries)
      .values({
        subject: scenario.subject,
        customerId: customer.id,
        assignedRepId: repId,
        status,
        serviceType: scenario.serviceType,
        priority: scenario.extraction.priority,
        summary: scenario.extraction.summary,
        extracted,
        conversationId,
        receivedAt: received,
        ackSentAt: ackAt,
        firstResponseAt,
        lastInboundAt: received,
        lastOutboundAt: firstResponseAt ?? ackAt,
        closedAt: closeLost ? addMinutes(received, 60 * 24 * 7) : null,
      })
      .returning();
    created++;

    const inquiryRef = inquiryNumber(inq.number);
    const msgs: (typeof messages.$inferInsert)[] = [
      {
        inquiryId: inq.id,
        direction: "inbound",
        sentBy: "customer",
        fromAddress: customer.email,
        fromName: customer.name,
        toAddresses: [mailbox],
        subject: scenario.subject,
        bodyText: scenario.body(customer.name),
        internetMessageId: `<seed-${i}-in@${customer.email.split("@")[1]}>`,
        conversationId,
        sentAt: received,
      },
      {
        inquiryId: inq.id,
        direction: "outbound",
        sentBy: "system",
        fromAddress: mailbox,
        fromName: "Outsource Logistics",
        toAddresses: [customer.email],
        subject: renderTemplate(ack.subject, { subject: scenario.subject, inquiryNumber: inquiryRef }),
        bodyText: renderTemplate(ack.body, {
          firstName: first,
          inquiryNumber: inquiryRef,
          serviceType: serviceTypeLabels[scenario.serviceType].toLowerCase(),
          repName: rep.name,
        }),
        internetMessageId: `<seed-${i}-ack@outsourcelogistics.com>`,
        conversationId,
        sentAt: ackAt,
      },
    ];

    const generated = pick(repReplies)(first, scenario);
    let finalText: string | null = null;
    if (replied) {
      finalText =
        rand() < profile.editRate
          ? `${generated}\n\nP.S. I'll also call you this afternoon to walk through the details.`
          : generated;
    }
    const editDistance = finalText ? distance(generated, finalText) : null;

    const [draft] = await db
      .insert(aiDrafts)
      .values({
        inquiryId: inq.id,
        model,
        generatedText: generated,
        finalText,
        editDistance,
        editRatio: editDistance === null ? null : editDistance / Math.max(generated.length, 1),
        status: replied ? "sent" : "pending",
        sentAt: firstResponseAt,
        createdAt: addMinutes(received, between(1, 3)),
      })
      .returning();

    if (replied && firstResponseAt && finalText) {
      msgs.push({
        inquiryId: inq.id,
        direction: "outbound",
        sentBy: "rep",
        senderUserId: repId,
        aiDraftId: draft.id,
        fromAddress: mailbox,
        fromName: rep.name,
        toAddresses: [customer.email],
        subject: `RE: ${scenario.subject} [${inquiryRef}]`,
        bodyText: `${finalText}\n${rep.name}\nOutsource Logistics | (866) 726-2715`,
        internetMessageId: `<seed-${i}-rep@outsourcelogistics.com>`,
        conversationId,
        sentAt: firstResponseAt,
      });

      const followUpAt = addMinutes(firstResponseAt, between(60, 60 * 30));
      if (rand() < 0.45 && followUpAt < now) {
        msgs.push({
          inquiryId: inq.id,
          direction: "inbound",
          sentBy: "customer",
          fromAddress: customer.email,
          fromName: customer.name,
          toAddresses: [mailbox],
          subject: `RE: ${scenario.subject} [${inquiryRef}]`,
          bodyText: `${pick(customerFollowUps)}\n\n${customer.name}`,
          internetMessageId: `<seed-${i}-fu@${customer.email.split("@")[1]}>`,
          conversationId,
          sentAt: followUpAt,
        });
        const followReplyAt = addMinutes(followUpAt, delayAround(profile.medianMinutes));
        if (followReplyAt < now) {
          msgs.push({
            inquiryId: inq.id,
            direction: "outbound",
            sentBy: "rep",
            senderUserId: repId,
            fromAddress: mailbox,
            fromName: rep.name,
            toAddresses: [customer.email],
            subject: `RE: ${scenario.subject} [${inquiryRef}]`,
            bodyText: `Hi ${first},\n\nConfirmed - you're all set. I'll send the booking confirmation shortly.\n\n${rep.name}`,
            internetMessageId: `<seed-${i}-fu-rep@outsourcelogistics.com>`,
            conversationId,
            sentAt: followReplyAt,
          });
          await db
            .update(inquiries)
            .set({ lastInboundAt: followUpAt, lastOutboundAt: followReplyAt })
            .where(sql`id = ${inq.id}`);
        } else if (status === "responded") {
          await db
            .update(inquiries)
            .set({ status: "needs_reply", lastInboundAt: followUpAt })
            .where(sql`id = ${inq.id}`);
        }
      }
    }

    await db.insert(messages).values(msgs);
    await db.insert(activityLog).values([
      { inquiryId: inq.id, type: "inquiry.created", details: { source: "email" }, createdAt: received },
      { inquiryId: inq.id, type: "ack.sent", createdAt: ackAt },
      ...(firstResponseAt
        ? [{ inquiryId: inq.id, userId: repId, type: "reply.sent", createdAt: firstResponseAt }]
        : []),
    ]);

    if (convert && firstResponseAt && addMinutes(firstResponseAt, 60) < now) {
      const bookedAt = new Date(Math.min(addMinutes(firstResponseAt, between(60, 60 * 48)).getTime(), now.getTime()));
      const completedAt = addMinutes(bookedAt, between(60 * 24, 60 * 24 * 12));
      const done = completedAt < now;
      const [order] = await db
        .insert(orders)
        .values({
          inquiryId: inq.id,
          customerId: customer.id,
          repId,
          serviceType: scenario.serviceType,
          status: done ? "completed" : rand() < 0.5 ? "in_progress" : "booked",
          description: scenario.extraction.summary,
          origin: scenario.extraction.origin,
          destination: scenario.extraction.destination,
          value: Math.round(between(...scenario.orderValue)),
          bookedAt,
          completedAt: done ? completedAt : null,
        })
        .returning();
      await db.insert(activityLog).values({
        inquiryId: inq.id,
        orderId: order.id,
        userId: repId,
        type: "order.created",
        createdAt: bookedAt,
      });
    }
  }

  const historical = Array.from({ length: 70 }, (_, i) => {
    const scenario = pick(scenarios);
    const customer = pick(customerRows);
    const bookedAt = new Date(now.getTime() - between(65, 180) * 86_400_000);
    return {
      externalRef: `LEGACY-${3000 + i}`,
      customerId: customer.id,
      repId: customer.ownerId,
      serviceType: scenario.serviceType,
      status: "completed" as const,
      description: scenario.extraction.summary,
      origin: scenario.extraction.origin,
      destination: scenario.extraction.destination,
      value: Math.round(between(...scenario.orderValue)),
      bookedAt,
      completedAt: addMinutes(bookedAt, between(60 * 24, 60 * 24 * 10)),
    };
  });
  await db.insert(orders).values(historical);

  console.log(
    `Seeded ${staffRows.length + repRows.length} users, ${customerRows.length} customers, ${created} inquiries, plus ${historical.length} historical orders.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
