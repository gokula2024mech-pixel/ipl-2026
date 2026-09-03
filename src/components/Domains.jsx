import { useState } from 'react'

import {
  Factory,
  Bot,
  Brain,
  Wifi,
  Zap,
  Leaf,
  Sprout,
  HeartPulse,
  Building2,
  Lightbulb,

  BarChart3,
  ScanFace,
  Code2,
  CloudCog,
  Blocks,
  Glasses,
  Cpu,
  CircuitBoard,
  Network,
  Cog,
  Dna,
  Atom,

  Accessibility,
  Dumbbell,
  Wheat,
  Waves,
  Droplets,
  Car,
  Truck,
  Pickaxe,
  CreditCard,
  Clapperboard,
  GraduationCap,
  Landmark,
  Siren,
  Shield,
  Rocket,
  School,

  Layers3,
  BriefcaseBusiness,
} from 'lucide-react'

import SectionHeading from './SectionHeading'
import SectionReveal from './SectionReveal'

import {
  DOMAINS,
  TECH_DOMAINS,
  BUSINESS_DOMAINS,
} from '../data/content'


/* =========================================================
   ICON MAP
   ========================================================= */

const ICON_MAP = {
  Factory,
  Bot,
  Brain,
  Wifi,
  Zap,
  Leaf,
  Sprout,
  HeartPulse,
  Building2,
  Lightbulb,

  BarChart3,
  ScanFace,
  Code2,
  CloudCog,
  Blocks,
  Glasses,
  Cpu,
  CircuitBoard,
  Network,
  Cog,
  Dna,
  Atom,

  Accessibility,
  Dumbbell,
  Wheat,
  Waves,
  Droplets,
  Car,
  Truck,
  Pickaxe,
  CreditCard,
  Clapperboard,
  GraduationCap,
  Landmark,
  Siren,
  Shield,
  Rocket,
  School,
}


/* =========================================================
   DOMAINS COMPONENT
   ========================================================= */

export default function Domains() {

  const [activeTab, setActiveTab] = useState('innovation')


  const tabs = [
    {
      id: 'innovation',
      label: 'Themes',
      icon: Layers3,
    },
    {
      id: 'tech',
      label: 'Tech Domains',
      icon: Cpu,
    },
    {
      id: 'business',
      label: 'Business Sectors',
      icon: BriefcaseBusiness,
    },
  ]


  return (
    <section
      id="domains"
      className="bg-slate-50 py-12 md:py-16 lg:py-20"
    >

      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">

        {/* =================================================
            SECTION HEADING
            ================================================= */}

        <SectionHeading
          eyebrow="Innovation Domains"
          title="Explore Our Innovation Domains"
          subtitle="Choose a domain that matches your passion and expertise."
        />


        {/* =================================================
            TAB SWITCHER
            ================================================= */}

        <div className="mb-8 sm:mb-10 flex justify-center">

          <div
            className="
              inline-flex
              items-center
              rounded-full
              border
              border-slate-200
              bg-white
              p-1.5
              shadow-md
            "
          >

            {tabs.map(({ id, label, icon: TabIcon }) => {

              const isActive = activeTab === id

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`
                    flex
                    items-center
                    gap-2
                    rounded-full
                    px-5
                    py-3
                    text-sm
                    font-semibold
                    transition-all
                    duration-300
                    md:px-7
                    ${
                      isActive
                        ? 'bg-primary text-white shadow-md'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-primary'
                    }
                  `}
                >

                  <TabIcon
                    size={19}
                    strokeWidth={2}
                    aria-hidden="true"
                  />

                  <span>
                    {label}
                  </span>

                </button>
              )
            })}

          </div>

        </div>


        {/* =================================================
            FIRST TAB — INNOVATION DOMAINS
            ================================================= */}

        {activeTab === 'innovation' && (

          <div>

            <div
              className="
                grid
                gap-6
                sm:grid-cols-2
                lg:grid-cols-3
                xl:grid-cols-5
              "
            >

              {DOMAINS.map(
                ({ title, description, icon }, i) => {

                  const Icon = ICON_MAP[icon]

                  return (

                    <SectionReveal
                      key={title}
                      delay={(i % 5) * 0.06}
                    >

                      <article
                        className="
                          group
                          flex
                          h-full
                          flex-col
                          rounded-2xl
                          border
                          border-slate-200
                          bg-white
                          p-5
                          shadow-sm
                          transition-all
                          duration-300
                          hover:-translate-y-1
                          hover:border-primary/30
                          hover:shadow-lg
                        "
                      >

                        <div
                          className="
                            mb-4
                            flex
                            h-12
                            w-full
                            items-center
                            rounded-xl
                            bg-slate-100
                            px-4
                            text-primary
                            transition-all
                            duration-300
                            group-hover:bg-primary
                            group-hover:text-white
                          "
                        >

                          {Icon && (
                            <Icon
                              size={22}
                              aria-hidden="true"
                            />
                          )}

                        </div>


                        <h3
                          className="
                            font-heading
                            text-sm sm:text-base
                            font-bold
                            leading-snug
                            text-slate-900
                          "
                        >
                          {title}
                        </h3>


                        <p
                          className="
                            mt-2
                            flex-1
                            text-xs sm:text-sm
                            leading-relaxed
                            text-slate-700
                            font-normal
                          "
                        >
                          {description}
                        </p>

                      </article>

                    </SectionReveal>

                  )
                }
              )}

            </div>

          </div>

        )}


        {/* =================================================
            SECOND TAB — TECH DOMAINS
            ================================================= */}

        {activeTab === 'tech' && (

          <div>

            <div
              className="
                grid
                gap-5
                sm:grid-cols-2
                lg:grid-cols-3
                xl:grid-cols-4
              "
            >

              {TECH_DOMAINS.map(
                ({ title, icon }, i) => {

                  const Icon = ICON_MAP[icon]

                  return (

                    <SectionReveal
                      key={title}
                      delay={(i % 4) * 0.06}
                    >

                      <article
                        className="
                          group
                          flex
                          min-h-[110px]
                          h-full
                          items-center
                          gap-4
                          rounded-2xl
                          border
                          border-slate-200
                          bg-white
                          p-5
                          shadow-sm
                          transition-all
                          duration-300
                          hover:-translate-y-1
                          hover:border-primary/30
                          hover:shadow-lg
                        "
                      >

                        <div
                          className="
                            flex
                            h-12
                            w-12
                            shrink-0
                            items-center
                            justify-center
                            rounded-xl
                            bg-slate-100
                            text-primary
                            transition-all
                            duration-300
                            group-hover:bg-primary
                            group-hover:text-white
                          "
                        >

                          {Icon && (
                            <Icon
                              size={23}
                              aria-hidden="true"
                            />
                          )}

                        </div>


                        <h3
                          className="
                            font-heading
                            text-sm sm:text-base
                            font-bold
                            leading-snug
                            text-slate-900
                          "
                        >
                          {title}
                        </h3>

                      </article>

                    </SectionReveal>

                  )
                }
              )}

            </div>

          </div>

        )}


        {/* =================================================
            THIRD TAB — BUSINESS / APPLICATION DOMAINS
            ================================================= */}

        {activeTab === 'business' && (

          <div>



            <div
              className="
                grid
                gap-5
                sm:grid-cols-2
                lg:grid-cols-3
                xl:grid-cols-4
              "
            >

              {BUSINESS_DOMAINS.map(
                ({ title, icon }, i) => {

                  const Icon = ICON_MAP[icon]

                  return (

                    <SectionReveal
                      key={title}
                      delay={(i % 4) * 0.06}
                    >

                      <article
                        className="
                          group
                          flex
                          min-h-[110px]
                          h-full
                          items-center
                          gap-4
                          rounded-2xl
                          border
                          border-slate-200
                          bg-white
                          p-5
                          shadow-sm
                          transition-all
                          duration-300
                          hover:-translate-y-1
                          hover:border-primary/30
                          hover:shadow-lg
                        "
                      >

                        <div
                          className="
                            flex
                            h-12
                            w-12
                            shrink-0
                            items-center
                            justify-center
                            rounded-xl
                            bg-slate-100
                            text-primary
                            transition-all
                            duration-300
                            group-hover:bg-primary
                            group-hover:text-white
                          "
                        >

                          {Icon && (
                            <Icon
                              size={23}
                              aria-hidden="true"
                            />
                          )}

                        </div>


                        <h3
                          className="
                            font-heading
                            text-sm sm:text-base
                            font-bold
                            leading-snug
                            text-slate-900
                          "
                        >
                          {title}
                        </h3>

                      </article>

                    </SectionReveal>

                  )
                }
              )}

            </div>

          </div>

        )}

      </div>

    </section>
  )
}