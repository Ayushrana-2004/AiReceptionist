import { useState } from "react";

const sections = [
  { id: "market", icon: "📈", label: "Market Opportunity", color: "#00D4AA" },
  { id: "what", icon: "🤖", label: "What It Does", color: "#7B61FF" },
  { id: "approach", icon: "🛠", label: "Build Approach", color: "#FF6B35" },
  { id: "techstack", icon: "⚙️", label: "Tech Stack", color: "#00B4D8" },
  { id: "niches", icon: "🎯", label: "Best Niches", color: "#F72585" },
  { id: "costs", icon: "💰", label: "Costs & Pricing", color: "#4CAF50" },
  { id: "sell", icon: "🚀", label: "How to Sell", color: "#FFB700" },
  { id: "roadmap", icon: "🗺", label: "Roadmap", color: "#E040FB" },
];

const content: Record<string, { title: string; subtitle: string; blocks: any[] }> = {
  market: {
    title: "Market Opportunity",
    subtitle: "Why now is the perfect time",
    blocks: [
      {
        type: "stat-grid",
        items: [
          { value: "$9B", label: "Virtual receptionist market by 2033", sub: "From $3.85B in 2024" },
          { value: "62%", label: "Business calls go unanswered", sub: "80% of those callers never call back" },
          { value: "$100", label: "Average lost revenue per missed call", sub: "For most service businesses" },
          { value: "1,700%", label: "ROI reported in year one", sub: "By early AI receptionist adopters" },
        ],
      },
      {
        type: "callout",
        text: "85% of customer interactions are expected to be handled without human agents by 2025.",
        style: "highlight",
      },
      {
        type: "prose",
        text: "Every dentist, lawyer, plumber, salon, and real estate agent faces the same problem: missed calls mean missed revenue.",
      },
    ],
  },
  what: {
    title: "What an AI Receptionist Does",
    subtitle: "Core capabilities your product must have",
    blocks: [
      {
        type: "feature-list",
        items: [
          { icon: "📞", title: "24/7 Call Answering", desc: "Picks up every inbound call instantly — no hold music, no voicemail. Handles multiple calls simultaneously." },
          { icon: "📅", title: "Appointment Booking", desc: "Checks live calendar availability (Google Cal, Outlook, Calendly) and books appointments in real-time." },
          { icon: "📚", title: "Custom Knowledge Base", desc: "Answers FAQs specific to the business — pricing, hours, location, services offered." },
          { icon: "🔀", title: "Smart Call Routing", desc: "Understands caller intent and transfers to the right human or department when needed." },
          { icon: "📋", title: "Lead Capture & CRM Sync", desc: "Collects caller details, qualifies leads, and syncs to HubSpot, Salesforce, or Zoho." },
          { icon: "💬", title: "SMS & Follow-ups", desc: "Sends automated confirmation texts, reminders, and follow-up messages to callers." },
          { icon: "📝", title: "Call Summaries & Transcripts", desc: "Every call is logged with a summary, transcript, and outcome so the business never misses context." },
          { icon: "🌍", title: "Multi-language Support", desc: "Serve callers in Spanish, French, Mandarin, and more — expanding the business reach." },
        ],
      },
      {
        type: "callout",
        text: "Key design principle: AI should handle 60–70% of calls completely. The other 30–40% get routed to humans.",
        style: "info",
      },
    ],
  },
  approach: {
    title: "Three Ways to Build It",
    subtitle: "Pick your path based on skill level and budget",
    blocks: [
      {
        type: "approach-cards",
        items: [
          {
            badge: "Fastest",
            badgeColor: "#00D4AA",
            title: "Path A: White-Label / Resell",
            time: "1–2 weeks to launch",
            difficulty: "No-code",
            cost: "$200–$500/mo platform fees",
            desc: "Use existing platforms like My AI Front Desk, Synthflow, Autocalls, or Kicker AI.",
            pros: ["Launch in days, not months", "No engineering required", "Proven, tested tech"],
            cons: ["Lower margins (30–50% gross)", "Limited customization", "Dependent on platform"],
            bestFor: "Non-technical founders, agencies adding a new revenue line",
          },
          {
            badge: "Recommended",
            badgeColor: "#7B61FF",
            title: "Path B: Build on Voice AI Platform",
            time: "2–6 weeks to launch",
            difficulty: "Low-code / some dev",
            cost: "$0.07–$0.30/min usage costs",
            desc: "Use Vapi, Retell AI, or Synthflow as your infrastructure. Build custom conversational flows.",
            pros: ["Higher margins (60–80%)", "Full control over agent behavior", "Custom integrations"],
            cons: ["Requires some technical knowledge", "Multi-vendor billing complexity", "Testing overhead"],
            bestFor: "Entrepreneurs with light tech skills or a developer partner",
          },
          {
            badge: "Max Control",
            badgeColor: "#FF6B35",
            title: "Path C: Custom-Built Stack",
            time: "3–6 months",
            difficulty: "Developer required",
            cost: "$3,000–$7,000 setup + $300–$700/mo",
            desc: "Build from scratch: Twilio/Telnyx for telephony + Deepgram/AssemblyAI for STT + LLM + TTS.",
            pros: ["Lowest cost at high volume", "Complete intellectual property", "Any feature possible"],
            cons: ["Months to build and test", "Requires full engineering team", "Ongoing maintenance"],
            bestFor: "Technical founders building a scalable SaaS product",
          },
        ],
      },
    ],
  },
  techstack: {
    title: "The Tech Stack Explained",
    subtitle: "How the pieces fit together",
    blocks: [
      {
        type: "stack-diagram",
        layers: [
          {
            label: "TELEPHONY LAYER",
            color: "#00B4D8",
            desc: "Handles the actual phone call infrastructure",
            tools: [
              { name: "Twilio", note: "Most popular, $0.01–0.02/min" },
              { name: "Telnyx", note: "Cheaper alternative" },
              { name: "Vonage / Nexmo", note: "Good for international" },
            ],
          },
          {
            label: "VOICE AI PLATFORM",
            color: "#7B61FF",
            desc: "Orchestrates all components, manages real-time audio",
            tools: [
              { name: "Vapi", note: "Best for devs, most flexible, $0.05/min" },
              { name: "Retell AI", note: "Best analytics, $0.07/min, 99.95% uptime" },
              { name: "Synthflow", note: "Best no-code, fast setup" },
              { name: "Bland AI", note: "Cheapest at volume" },
            ],
          },
          {
            label: "SPEECH-TO-TEXT (STT)",
            color: "#00D4AA",
            desc: "Converts caller's voice to text in real-time",
            tools: [
              { name: "Deepgram Nova-3", note: "Fastest, best accuracy" },
              { name: "AssemblyAI", note: "Strong for noisy environments" },
              { name: "Google STT", note: "Reliable, good language support" },
            ],
          },
          {
            label: "LANGUAGE MODEL (LLM)",
            color: "#F72585",
            desc: "The 'brain' — understands intent, generates responses",
            tools: [
              { name: "Claude (Anthropic)", note: "Best for natural conversation" },
              { name: "GPT-4o / GPT-4o-mini", note: "Fast and reliable" },
              { name: "Groq + Llama", note: "Fastest response time" },
            ],
          },
          {
            label: "TEXT-TO-SPEECH (TTS)",
            color: "#FF6B35",
            desc: "Converts AI response back to natural-sounding voice",
            tools: [
              { name: "ElevenLabs", note: "Most human-like, best quality" },
              { name: "Cartesia Sonic", note: "Fastest latency" },
              { name: "PlayHT", note: "Good balance of quality/cost" },
            ],
          },
          {
            label: "INTEGRATIONS LAYER",
            color: "#4CAF50",
            desc: "Connects the AI to business tools",
            tools: [
              { name: "Google Calendar / Outlook", note: "Appointment booking" },
              { name: "HubSpot / Salesforce / Zoho", note: "CRM sync" },
              { name: "Zapier / Make", note: "Workflow automation" },
              { name: "Calendly / Acuity", note: "Scheduling" },
            ],
          },
        ],
      },
      {
        type: "callout",
        text: "All-in cost reality check: Advertised rates ($0.05–0.11/min) only cover the platform fee, not LLM, TTS, or telephony costs.",
        style: "warning",
      },
    ],
  },
  niches: {
    title: "Best Niches to Target",
    subtitle: "Start vertical, go deep — don't sell to everyone",
    blocks: [
      {
        type: "niche-grid",
        items: [
          { emoji: "🦷", title: "Dental Practices", value: "High", why: "Appointment-heavy, busy receptionists, high patient value. Integrate with Dentrix.", tag: "Best starter niche" },
          { emoji: "⚖️", title: "Law Firms", value: "Very High", why: "A single missed client call = $500+ lost. Intake forms, conflict checks, appointment setting.", tag: "Highest LTV" },
          { emoji: "🔧", title: "HVAC / Plumbing / Electricians", value: "High", why: "Emergency calls 24/7, quote intake, scheduling. Owners are always on the job.", tag: "Easy to close" },
          { emoji: "🏠", title: "Real Estate Agents", value: "Medium-High", why: "Lead capture, property inquiry handling, showing scheduling. Charge $200–400/mo.", tag: "Large market" },
          { emoji: "💇", title: "Salons & Spas", value: "Medium", why: "Booking-heavy, staff always busy with clients, seasonal surges. Charge $150–250/mo.", tag: "Easy to demo" },
          { emoji: "🏥", title: "Healthcare / Clinics", value: "High", why: "Appointment reminders, intake, FAQ answering. Need HIPAA compliance. Charge $500+/mo.", tag: "HIPAA required" },
          { emoji: "🏋️", title: "Gyms & Fitness Studios", value: "Medium", why: "Class booking, membership inquiries, intro call scheduling. Charge $150–300/mo.", tag: "Recurring revenue" },
          { emoji: "🚗", title: "Auto Repair Shops", value: "Medium-High", why: "Service scheduling, status updates, quote intake. Owners never at a desk. Charge $200–350/mo.", tag: "Low competition" },
        ],
      },
      {
        type: "callout",
        text: "Pro tip: Pick ONE niche first. Build a single demo tailored to dental offices (or your chosen vertical) before expanding.",
        style: "info",
      },
    ],
  },
  costs: {
    title: "Costs, Margins & Pricing",
    subtitle: "What you pay vs. what you charge",
    blocks: [
      {
        type: "cost-table",
        title: "Your Costs (per client, per month)",
        rows: [
          { item: "Voice AI platform (Retell/Vapi)", cost: "$20–80", note: "Depends on call volume" },
          { item: "LLM tokens (Claude/GPT)", cost: "$5–30", note: "Per volume of calls" },
          { item: "TTS voice (ElevenLabs)", cost: "$5–20", note: "Per minutes of audio" },
          { item: "Telephony (Twilio/Telnyx)", cost: "$5–15", note: "Per call minutes" },
          { item: "Phone number rental", cost: "$2–5", note: "1 DID per client" },
          { item: "Integrations overhead", cost: "$5–10", note: "Zapier/Make if needed" },
          { item: "TOTAL COST", cost: "$42–160", note: "Typical small business client", bold: true },
        ],
      },
      {
        type: "pricing-cards",
        title: "What to Charge Clients",
        items: [
          {
            tier: "Starter",
            price: "$199–299/mo",
            color: "#00D4AA",
            includes: ["Up to 200 call minutes", "Appointment booking", "Basic FAQ answering"],
            margin: "~70% gross margin",
          },
          {
            tier: "Professional",
            price: "$399–599/mo",
            color: "#7B61FF",
            includes: ["Up to 500 call minutes", "CRM integration", "SMS follow-ups", "Custom voice"],
            margin: "~65% gross margin",
          },
          {
            tier: "Premium",
            price: "$699–1,200/mo",
            color: "#FF6B35",
            includes: ["Unlimited call minutes", "Multi-language", "HIPAA compliance", "Full customization"],
            margin: "~60% gross margin",
          },
        ],
      },
      {
        type: "callout",
        text: "Revenue math: 20 clients × $399/mo = $7,980 MRR. 50 clients × $399/mo = ~$20,000 MRR.",
        style: "highlight",
      },
    ],
  },
  sell: {
    title: "How to Sell It",
    subtitle: "Proven sales strategies that close deals",
    blocks: [
      {
        type: "sales-steps",
        items: [
          { step: "1", title: "Build a niche-specific demo first", desc: "Create a working AI receptionist for a dental office (or your chosen niche). Make it real and impressive." },
          { step: "2", title: "Lead with the problem, not the tech", desc: "Don't say 'I sell AI receptionists.' Say: 'You're losing 15–20 calls a week — I can fix that.'" },
          { step: "3", title: "Cold outreach to your niche", desc: "Call or email 50 businesses in your niche per week. Use tools like Apollo.io for leads." },
          { step: "4", title: "Offer a free trial (7–14 days)", desc: "Let them experience the AI on their real phone line. Most business owners convert after hearing it work." },
          { step: "5", title: "Onboard white-glove", desc: "Handle all setup yourself. Get their FAQs, business hours, services, team info. Make it effortless for them." },
          { step: "6", title: "Lock in with annual contracts", desc: "Offer a 10–15% discount for annual payment. This improves your cash flow and reduces churn." },
        ],
      },
      {
        type: "channels",
        title: "Best Sales Channels",
        items: [
          { icon: "🗺", label: "Google Maps cold outreach", desc: "Find local businesses, call them directly" },
          { icon: "💼", label: "LinkedIn outreach", desc: "Target business owners by industry" },
          { icon: "🤝", label: "Referral partnerships", desc: "Partner with web designers, marketers" },
          { icon: "🎥", label: "YouTube / TikTok demos", desc: "Post demo videos of your AI in action" },
          { icon: "📧", label: "Email sequences", desc: "5-email cold sequence focusing on the pain" },
          { icon: "👥", label: "Local business groups", desc: "BNI, Chamber of Commerce, Facebook groups" },
        ],
      },
    ],
  },
  roadmap: {
    title: "Your Launch Roadmap",
    subtitle: "From idea to first paying client",
    blocks: [
      {
        type: "timeline",
        items: [
          {
            week: "Week 1–2",
            color: "#00D4AA",
            title: "Foundation",
            tasks: [
              "Choose your approach (white-label vs. Vapi/Retell build)",
              "Sign up for Retell AI or Vapi (both have free tiers)",
              "Pick your first niche (recommendation: dental or HVAC)",
              "Set up a Twilio or Telnyx account for phone numbers",
              "Register a business name and basic website",
            ],
          },
          {
            week: "Week 3–4",
            color: "#7B61FF",
            title: "Build Your Demo",
            tasks: [
              "Build a working AI agent for your chosen niche",
              "Write a strong system prompt (role, rules, booking flow, FAQ)",
              "Connect Google Calendar for live appointment booking",
              "Test with 50+ mock calls — fix edge cases",
              "Record a 2-minute demo video of the agent in action",
            ],
          },
          {
            week: "Month 2",
            color: "#FF6B35",
            title: "First Clients",
            tasks: [
              "Reach out to 200 businesses in your niche",
              "Offer free 14-day trials to 5–10 businesses",
              "Onboard your first 3 paying clients",
              "Collect testimonials and case studies",
              "Refine your onboarding process",
            ],
          },
          {
            week: "Month 3–6",
            color: "#F72585",
            title: "Scale",
            tasks: [
              "Build a simple onboarding dashboard for clients",
              "Hire a VA to help with sales outreach",
              "Add integrations: HubSpot, Salesforce, Zapier",
              "Launch referral program for existing clients",
              "Expand to a second niche using same playbook",
            ],
          },
          {
            week: "Month 6–12",
            color: "#FFB700",
            title: "Productize",
            tasks: [
              "Build self-serve signup and configuration portal",
              "Add white-label options for agencies to resell",
              "Consider HIPAA compliance to unlock healthcare niche",
              "Explore SMS / web chat receptionist channels",
              "Target $10K–$20K MRR milestone",
            ],
          },
        ],
      },
      {
        type: "callout",
        text: "Critical success factor: Don't build for months before selling. Get a basic working demo and start outreach in week 3.",
        style: "warning",
      },
    ],
  },
};

export default function AIReceptionistGuide() {
  const [active, setActive] = useState("market");
  const section = content[active];

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        background: "#0A0A0F",
        minHeight: "100vh",
        color: "#E8E8F0",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0A0A0F; }
        ::-webkit-scrollbar-thumb { background: #2A2A3F; border-radius: 3px; }
        .nav-btn { transition: all 0.2s ease; }
        .nav-btn:hover { transform: translateX(3px); }
        .nav-btn.active { transform: translateX(6px); }
        .card-hover { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,0,0,0.3); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.35s ease forwards; }
      `}</style>

      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #0D0D1A 0%, #13132A 100%)",
          borderBottom: "1px solid #1E1E35",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "linear-gradient(135deg, #00D4AA, #7B61FF)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          🤖
        </div>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px" }}>
            AI Receptionist Business Blueprint
          </div>
          <div style={{ fontSize: 12, color: "#6060A0", marginTop: 1 }}>Deep Research Guide · 2024</div>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 73px)" }}>
        {/* Sidebar Nav */}
        <div
          style={{
            width: 200,
            background: "#0D0D1A",
            borderRight: "1px solid #1E1E35",
            padding: "20px 12px",
            flexShrink: 0,
            position: "sticky",
            top: 73,
            height: "calc(100vh - 73px)",
            overflowY: "auto",
          }}
        >
          {sections.map((s) => (
            <button
              key={s.id}
              className={`nav-btn ${active === s.id ? "active" : ""}`}
              onClick={() => setActive(s.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                marginBottom: 4,
                background: active === s.id
                  ? `linear-gradient(90deg, ${s.color}22, ${s.color}11)`
                  : "transparent",
                borderLeft: active === s.id ? `3px solid ${s.color}` : "3px solid transparent",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: active === s.id ? 600 : 400,
                  color: active === s.id ? "#fff" : "#7070A0",
                  lineHeight: 1.3,
                }}
              >
                {s.label}
              </span>
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: "28px 28px", overflowY: "auto", maxWidth: 900 }}>
          <div key={active} className="fade-in">
            <div style={{ marginBottom: 28 }}>
              <h1
                style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 26,
                  fontWeight: 800,
                  color: "#fff",
                  letterSpacing: "-0.5px",
                  marginBottom: 6,
                }}
              >
                {section.title}
              </h1>
              <p style={{ color: "#7070A0", fontSize: 14 }}>{section.subtitle}</p>
            </div>
            {section.blocks.map((block, i) => (
              <BlockRenderer key={i} block={block} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockRenderer({ block }: { block: any }) {
  if (block.type === "stat-grid") return <StatGrid items={block.items} />;
  if (block.type === "callout") return <Callout text={block.text} variant={block.style} />;
  if (block.type === "prose") return <Prose text={block.text} />;
  if (block.type === "feature-list") return <FeatureList items={block.items} />;
  if (block.type === "approach-cards") return <ApproachCards items={block.items} />;
  if (block.type === "stack-diagram") return <StackDiagram layers={block.layers} />;
  if (block.type === "niche-grid") return <NicheGrid items={block.items} />;
  if (block.type === "cost-table") return <CostTable title={block.title} rows={block.rows} />;
  if (block.type === "pricing-cards") return <PricingCards title={block.title} items={block.items} />;
  if (block.type === "sales-steps") return <SalesSteps items={block.items} />;
  if (block.type === "channels") return <Channels title={block.title} items={block.items} />;
  if (block.type === "timeline") return <Timeline items={block.items} />;
  return null;
}

function StatGrid({ items }: { items: any[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
      {items.map((item, i) => (
        <div
          key={i}
          className="card-hover"
          style={{
            background: "#13132A",
            border: "1px solid #1E1E35",
            borderRadius: 14,
            padding: "18px 20px",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "#00D4AA", marginBottom: 4 }}>
            {item.value}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#C0C0E0", marginBottom: 4 }}>{item.label}</div>
          <div style={{ fontSize: 11.5, color: "#5050A0" }}>{item.sub}</div>
        </div>
      ))}
    </div>
  );
}

function Callout({ text, variant }: { text: string; variant: string }) {
  const styles: Record<string, { bg: string; border: string; icon: string; iconColor: string }> = {
    highlight: { bg: "#1A2A1A", border: "#00D4AA44", icon: "✨", iconColor: "#00D4AA" },
    info: { bg: "#13132A", border: "#7B61FF44", icon: "💡", iconColor: "#7B61FF" },
    warning: { bg: "#2A1A0A", border: "#FF6B3544", icon: "⚠️", iconColor: "#FF6B35" },
  };
  const s = styles[variant] || styles.info;

  return (
    <div
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        marginBottom: 20,
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
      <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#C0C0E0" }}>{text}</p>
    </div>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <p
      style={{
        fontSize: 14,
        lineHeight: 1.8,
        color: "#9090C0",
        marginBottom: 20,
        padding: "0 4px",
      }}
    >
      {text}
    </p>
  );
}

function FeatureList({ items }: { items: any[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
      {items.map((item, i) => (
        <div
          key={i}
          className="card-hover"
          style={{
            background: "#13132A",
            border: "1px solid #1E1E35",
            borderRadius: 12,
            padding: "16px",
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#fff", marginBottom: 5 }}>{item.title}</div>
          <div style={{ fontSize: 12.5, color: "#7070A0", lineHeight: 1.6 }}>{item.desc}</div>
        </div>
      ))}
    </div>
  );
}

function ApproachCards({ items }: { items: any[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
      {items.map((item, i) => (
        <div
          key={i}
          className="card-hover"
          style={{
            background: "#13132A",
            border: `1px solid ${item.badgeColor}33`,
            borderRadius: 14,
            padding: "20px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <span
                style={{
                  background: item.badgeColor,
                  color: "#000",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 20,
                  letterSpacing: "0.5px",
                  display: "inline-block",
                  marginBottom: 8,
                }}
              >
                {item.badge}
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{item.title}</h3>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
              {[
                { label: "🕐 " + item.time },
                { label: "📊 " + item.difficulty },
                { label: "💵 " + item.cost },
              ].map((tag, j) => (
                <span
                  key={j}
                  style={{
                    background: "#0D0D1A",
                    border: "1px solid #2A2A45",
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 11,
                    color: "#8080B0",
                  }}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 13, color: "#9090C0", lineHeight: 1.7, marginBottom: 14 }}>{item.desc}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#00D4AA", marginBottom: 6 }}>PROS</div>
              {item.pros.map((p: string, j: number) => (
                <div key={j} style={{ fontSize: 12, color: "#8080B0", marginBottom: 3, display: "flex", gap: 6 }}>
                  <span style={{ color: "#00D4AA" }}>✓</span> {p}
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#FF6B35", marginBottom: 6 }}>CONS</div>
              {item.cons.map((c: string, j: number) => (
                <div key={j} style={{ fontSize: 12, color: "#8080B0", marginBottom: 3, display: "flex", gap: 6 }}>
                  <span style={{ color: "#FF6B35" }}>✗</span> {c}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#0D0D1A", borderRadius: 8 }}>
            <span style={{ fontSize: 11.5, color: "#7B61FF", fontWeight: 600 }}>Best for: </span>
            <span style={{ fontSize: 11.5, color: "#7070A0" }}>{item.bestFor}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StackDiagram({ layers }: { layers: any[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {layers.map((layer, i) => (
        <div
          key={i}
          style={{
            background: "#13132A",
            border: `1px solid ${layer.color}33`,
            borderLeft: `3px solid ${layer.color}`,
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.8px",
                color: layer.color,
                background: `${layer.color}22`,
                padding: "2px 8px",
                borderRadius: 20,
              }}
            >
              {layer.label}
            </span>
            <span style={{ fontSize: 12, color: "#5050A0" }}>{layer.desc}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {layer.tools.map((tool: any, j: number) => (
              <div
                key={j}
                style={{
                  background: "#0D0D1A",
                  border: "1px solid #2A2A45",
                  borderRadius: 8,
                  padding: "6px 12px",
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#C0C0E0" }}>{tool.name}</span>
                <span style={{ fontSize: 11, color: "#5050A0", marginLeft: 6 }}>{tool.note}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NicheGrid({ items }: { items: any[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
      {items.map((item, i) => (
        <div
          key={i}
          className="card-hover"
          style={{
            background: "#13132A",
            border: "1px solid #1E1E35",
            borderRadius: 12,
            padding: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ fontSize: 24 }}>{item.emoji}</div>
            <span
              style={{
                fontSize: 10,
                background: "#0D0D1A",
                border: "1px solid #2A2A45",
                borderRadius: 20,
                padding: "2px 8px",
                color: "#8080B0",
              }}
            >
              {item.tag}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{item.title}</div>
          <div style={{ fontSize: 11.5, color: "#7070A0", lineHeight: 1.6 }}>{item.why}</div>
        </div>
      ))}
    </div>
  );
}

function CostTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#C0C0E0", marginBottom: 12 }}>{title}</h3>
      <div
        style={{
          background: "#13132A",
          border: "1px solid #1E1E35",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: i < rows.length - 1 ? "1px solid #1A1A2E" : "none",
              background: row.bold ? "#1A1A3A" : "transparent",
            }}
          >
            <span style={{ fontSize: 13, color: row.bold ? "#fff" : "#9090C0", fontWeight: row.bold ? 700 : 400 }}>
              {row.item}
            </span>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#5050A0" }}>{row.note}</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: row.bold ? "#FF6B35" : "#00D4AA",
                  minWidth: 70,
                  textAlign: "right",
                }}
              >
                {row.cost}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingCards({ title, items }: { title: string; items: any[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#C0C0E0", marginBottom: 12 }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {items.map((item, i) => (
          <div
            key={i}
            className="card-hover"
            style={{
              background: "#13132A",
              border: `1px solid ${item.color}44`,
              borderRadius: 12,
              padding: "18px 16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: item.color, marginBottom: 8 }}>{item.tier}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "#fff", marginBottom: 12 }}>
              {item.price}
            </div>
            {item.includes.map((inc: string, j: number) => (
              <div key={j} style={{ fontSize: 11.5, color: "#7070A0", marginBottom: 5, display: "flex", gap: 6, justifyContent: "center" }}>
                <span style={{ color: item.color, flexShrink: 0 }}>✓</span> {inc}
              </div>
            ))}
            <div
              style={{
                marginTop: 12,
                padding: "6px",
                background: `${item.color}22`,
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 600,
                color: item.color,
              }}
            >
              {item.margin}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesSteps({ items }: { items: any[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: "linear-gradient(135deg, #00D4AA, #7B61FF)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {item.step}
          </div>
          <div
            style={{
              background: "#13132A",
              border: "1px solid #1E1E35",
              borderRadius: 12,
              padding: "14px 16px",
              flex: 1,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 6 }}>{item.title}</div>
            <div style={{ fontSize: 13, color: "#7070A0", lineHeight: 1.7 }}>{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Channels({ title, items }: { title: string; items: any[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#C0C0E0", marginBottom: 12 }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              background: "#13132A",
              border: "1px solid #1E1E35",
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#C0C0E0", marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "#5050A0" }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Timeline({ items }: { items: any[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <div
              style={{
                width: 44,
                height: 44,
                background: `${item.color}22`,
                border: `2px solid ${item.color}`,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 8, fontWeight: 800, color: item.color, textAlign: "center" }}>
                {item.week.split(" ").map((w: string, j: number) => (
                  <div key={j}>{w}</div>
                ))}
              </div>
            </div>
            {i < items.length - 1 && <div style={{ width: 2, flex: 1, background: "#1E1E35", margin: "4px 0" }} />}
          </div>
          <div
            style={{
              background: "#13132A",
              border: `1px solid ${item.color}33`,
              borderRadius: 12,
              padding: "16px",
              flex: 1,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 10 }}>{item.title}</div>
            {item.tasks.map((task: string, j: number) => (
              <div
                key={j}
                style={{
                  fontSize: 12.5,
                  color: "#8080B0",
                  marginBottom: 6,
                  display: "flex",
                  gap: 8,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: item.color, flexShrink: 0 }}>→</span> {task}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
