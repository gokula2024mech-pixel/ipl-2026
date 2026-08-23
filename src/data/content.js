export const REGISTRATION_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfPRcCHYYDc7WWoNmJofBCH8j6y-yoWGvJ15TecXmVWBlyZ6g/viewform?usp=publish-editor'

export const TAGLINE =
  'Ideate • Innovate • Design • Develop • Commercialize'

export const SUB_TAGLINE =
  'Transforming Ideas into Innovative Products'


/* =========================================================
   FIRST TAB — INNOVATION DOMAINS
   Existing domains
   ========================================================= */

export const DOMAINS = [
  {
    title: 'Smart Manufacturing & Industry 4.0',
    description:
      'Digital manufacturing, automation, predictive maintenance, and connected factory solutions for the fourth industrial revolution.',
    icon: 'Factory',
  },
  {
    title: 'Robotics & Intelligent Automation',
    description:
      'Autonomous robots, intelligent control systems, and automated workflows that enhance productivity and precision.',
    icon: 'Bot',
  },
  {
    title: 'Artificial Intelligence',
    description:
      'Machine learning, computer vision, natural language processing, and AI-driven decision systems for real-world applications.',
    icon: 'Brain',
  },
  {
    title: 'IoT & Smart Systems',
    description:
      'Connected sensor networks, smart monitoring platforms, and embedded systems for intelligent environments.',
    icon: 'Wifi',
  },
  {
    title: 'Electric Mobility & Energy',
    description:
      'Electric vehicles, battery management, renewable energy systems, and sustainable power solutions.',
    icon: 'Zap',
  },
  {
    title: 'Sustainable & Green Technology',
    description:
      'Eco-friendly products, waste reduction innovations, and carbon-neutral technologies for a greener future.',
    icon: 'Leaf',
  },
  {
    title: 'Smart Agriculture & Rural Innovation',
    description:
      'Precision farming tools, agri-tech solutions, and innovations that uplift rural communities and food security.',
    icon: 'Sprout',
  },
  {
    title: 'Healthcare & Assistive Technology',
    description:
      'Medical devices, health monitoring systems, and assistive technologies that improve quality of life.',
    icon: 'HeartPulse',
  },
  {
    title: 'Smart Infrastructure & Public Safety',
    description:
      'Urban infrastructure solutions, disaster management systems, and public safety innovations.',
    icon: 'Building2',
  },
  {
    title: 'Open Innovation',
    description:
      'Cross-domain ideas and unconventional solutions that address genuine problems beyond traditional categories.',
    icon: 'Lightbulb',
  },
]


/* =========================================================
   SECOND TAB — TECH DOMAINS
   ========================================================= */

export const TECH_DOMAINS = [
  {
    title: 'AI & Machine Learning',
    icon: 'Brain',
  },
  {
    title: 'Data Science & Analytics',
    icon: 'BarChart3',
  },
  {
    title: 'Computer Vision, NLP & Generative AI',
    icon: 'ScanFace',
  },
  {
    title: 'Software Development (Web & Mobile)',
    icon: 'Code2',
  },
  {
    title: 'Cloud, DevOps & Cybersecurity',
    icon: 'CloudCog',
  },
  {
    title: 'Blockchain & Web3',
    icon: 'Blocks',
  },
  {
    title: 'Immersive Tech & Game Development (AR / VR / XR)',
    icon: 'Glasses',
  },
  {
    title: 'Embedded Systems, IoT & Edge AI',
    icon: 'Cpu',
  },
  {
    title: 'VLSI & Semiconductor Technology',
    icon: 'CircuitBoard',
  },
  {
    title: 'Robotics, Control & Automation',
    icon: 'Bot',
  },
  {
    title: 'Communication, Signal Processing & Networking',
    icon: 'Network',
  },
  {
    title: 'Power Electronics & Electrical Drives',
    icon: 'Zap',
  },
  {
    title: 'Mechanical Design, Materials & Manufacturing',
    icon: 'Cog',
  },
  {
    title: 'Biomedical & Biotechnology',
    icon: 'Dna',
  },
  {
    title: 'Computational Modelling & Quantum Computing',
    icon: 'Atom',
  },
]


/* =========================================================
   THIRD TAB — BUSINESS DOMAINS
   ========================================================= */

export const BUSINESS_DOMAINS = [
  {
    title: 'Healthcare, MedTech & Life Sciences',
    icon: 'HeartPulse',
  },
  {
    title: 'Assistive & Inclusive Technology',
    icon: 'Accessibility',
  },
  {
    title: 'Sports, Fitness & Wellness',
    icon: 'Dumbbell',
  },
  {
    title: 'Agriculture, Food Technology & Rural Development',
    icon: 'Wheat',
  },
  {
    title: 'Marine, Fisheries & Ocean Resources',
    icon: 'Waves',
  },
  {
    title: 'Energy, Renewables & CleanTech',
    icon: 'Leaf',
  },
  {
    title: 'Environment, Climate, Water & Waste Management',
    icon: 'Droplets',
  },
  {
    title: 'Manufacturing & Industry 4.0',
    icon: 'Factory',
  },
  {
    title: 'Automotive, Mobility & Transportation',
    icon: 'Car',
  },
  {
    title: 'Logistics & Supply Chain',
    icon: 'Truck',
  },
  {
    title: 'Construction, Infrastructure & Smart Cities',
    icon: 'Building2',
  },
  {
    title: 'Mining, Metals, Materials & Textiles',
    icon: 'Pickaxe',
  },
  {
    title: 'FinTech, Banking, Insurance & Retail',
    icon: 'CreditCard',
  },
  {
    title: 'Tourism, Media, Entertainment & Culture',
    icon: 'Clapperboard',
  },
  {
    title: 'Education, EdTech & Skill Development',
    icon: 'GraduationCap',
  },
  {
    title: 'Governance, Public Services & Social Impact',
    icon: 'Landmark',
  },
  {
    title: 'Disaster Management & Emergency Response',
    icon: 'Siren',
  },
  {
    title: 'Defence, Security & Surveillance',
    icon: 'Shield',
  },
  {
    title: 'Space & Aerospace',
    icon: 'Rocket',
  },
  {
    title: 'Campus & Institutional Innovation',
    icon: 'School',
  },
]


/* =========================================================
   PROGRAM PHASES
   ========================================================= */

export const PHASES = [
  {
    id: 1,
    title: 'Ideation & Concept Design',
    week: 'Week 1',
    objective:
      'Identify a genuine real-world problem and turn it into a well-defined, feasible, and cost-justified concept.',
    outputs: [
      'Problem Statement',
      'CAD/Sketch',
      'Block Diagram',
      'Bill of Materials (BOM)',
      'Cost Estimate',
    ],
    evaluation: [
      { label: 'Creativity', value: 25 },
      { label: 'Feasibility', value: 25 },
      { label: 'Impact', value: 25 },
      { label: 'Cost', value: 25 },
    ],
  },

  {
    id: 2,
    title: 'Prototype Development & Testing',
    week: 'Weeks 2–3',
    objective:
      'Design, build, and rigorously test a working prototype that proves the concept functions as intended.',
    outputs: [
      'Functional Prototype',
      'Integration Documentation',
      'Test Data',
      'Demo Video',
    ],
    evaluation: [
      { label: 'Performance', value: 35 },
      { label: 'Reliability', value: 25 },
      { label: 'Innovation', value: 25 },
      { label: 'Finish', value: 15 },
    ],
  },

  {
    id: 3,
    title: 'Product Showcase & Commercialization',
    week: 'Week 4',
    objective:
      'Present the finished product to an expert panel as a market-aware, business-ready innovation.',
    outputs: [
      'Live Demonstration',
      'Market Positioning',
      'Business Model',
      'Future Scope',
    ],
    evaluation: [
      { label: 'Innovation', value: 30 },
      { label: 'Prototype', value: 25 },
      { label: 'Market', value: 20 },
      { label: 'User Experience', value: 15 },
      { label: 'Pitch', value: 10 },
    ],
  },
]


/* =========================================================
   JUDGING CRITERIA
   ========================================================= */

export const JUDGING_CRITERIA = [
  {
    label: 'Innovation',
    value: 30,
    color: '#1E3A8A',
  },
  {
    label: 'Technical Design',
    value: 20,
    color: '#2563EB',
  },
  {
    label: 'Working Prototype',
    value: 25,
    color: '#F59E0B',
  },
  {
    label: 'Product Usability',
    value: 15,
    color: '#10B981',
  },
  {
    label: 'Presentation',
    value: 10,
    color: '#8B5CF6',
  },
]


/* =========================================================
   TIMELINE EVENTS
   ========================================================= */

export const TIMELINE_EVENTS = [
  {
    date: '18-Aug-2026',
    title: 'Registration & Team Formation',
    description:
      'Team formation, domain selection, and problem identification.',
  },

  {
    date: 'Week 1',
    title: 'Phase 1: Ideation & Concept Design',
    description:
      'Concept design, CAD/sketch, block diagram, BOM, and cost estimate.',

    patentPhase: 'PHASE 1',
    patentIcon: '🎨',
    patentTitle: 'DESIGN PATENT',
    patentDescription: 'Design & Appearance Protection',
  },

  {
    date: 'Week 2',
    title: 'Phase 2: Prototype Development',
    description:
      'Component sourcing, hardware development, software development, integration, and first testing.',
  },

  {
    date: 'Week 3',
    title: 'Design Refinement & Testing',
    description:
      'Iterate on results, final testing, and documentation.',

    patentPhase: 'PHASE 2',
    patentIcon: '⚙️',
    patentTitle: 'UTILITY PATENT',
    patentDescription: 'Technical & Functional Protection',
  },

  {
    date: '15-Sep-2026',
    title: 'Phase 3: Pitch Preparation',
    description:
      'Pitch deck, business model, mentorship, and dry runs.',

    patentPhase: 'PHASE 3',
    patentIcon: '🛡️',
    patentTitle: 'PATENTABILITY',
    patentDescription: 'Validation & Documentation',
  },

  {
    date: 'Week 4',
    title: 'Phase 3: Final Expo & Winners',
    description:
      'Live demo, expert panel evaluation, winner announcement, and incubation onboarding.',

    patentIcon: '📜',
    patentTitle: 'PATENT FILING',
    patentDescription: 'IP & Commercialization',
  },
]


/* =========================================================
   PROGRAM FLOW
   ========================================================= */

export const PROGRAM_FLOW_STEPS = [
  'Registration',
  'Team Formation',
  'Domain Selection',
  'Problem Identification',
  'Phase 1 — Ideation',
  'Phase 2 — Prototype Build',
  'Design Refinement & Testing',
  'Pitch Preparation',
  'Final Expo',
  'Expert Panel Evaluation',
  'Winner Announcement',
  'Incubation Onboarding',
]