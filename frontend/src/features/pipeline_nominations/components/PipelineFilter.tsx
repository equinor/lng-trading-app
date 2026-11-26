import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  type FacilityFilter,
  selectionToken,
} from "@/features/pipeline_nominations/api"
import { REGION_LABEL, REGIONS } from "@/features/pipeline_nominations/utils"

type Props = {
  facilities: FacilityFilter[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  colorOf: (name: string) => string
}

/** Facility checkboxes grouped by region that expand to their pipelines. Nothing selected means everything. */
export function PipelineFilter({
  facilities,
  selected,
  onChange,
  colorOf,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpanded = (name: string) => {
    const next = new Set(expanded)
    if (!next.delete(name)) next.add(name)
    setExpanded(next)
  }

  const toggleFacility = (facility: FacilityFilter, allSelected: boolean) => {
    const next = new Set(selected)
    for (const pipeline of facility.pipelines) {
      const token = selectionToken(facility.name, pipeline)
      if (allSelected) next.delete(token)
      else next.add(token)
    }
    onChange(next)
  }

  const togglePipeline = (token: string) => {
    const next = new Set(selected)
    if (!next.delete(token)) next.add(token)
    onChange(next)
  }

  const regions = REGIONS.map((region) => ({
    region,
    facilities: facilities.filter((f) => f.region === region),
  })).filter((group) => group.facilities.length > 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Pipeline name</h2>
        {selected.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange(new Set())}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {regions.map((group) => (
          <section
            key={group.region}
            className="flex flex-col gap-1"
            aria-label={`${REGION_LABEL[group.region]} facilities`}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {REGION_LABEL[group.region]}
            </h3>
            <ul className="flex flex-col gap-1">
              {group.facilities.map((facility) => {
                const index = facilities.indexOf(facility)
                const tokens = facility.pipelines.map((p) =>
                  selectionToken(facility.name, p),
                )
                const count = tokens.filter((t) => selected.has(t)).length
                const checked =
                  count === tokens.length
                    ? true
                    : count > 0
                      ? "indeterminate"
                      : false
                const isOpen = expanded.has(facility.name)
                const facilityId = `facility-${index}`

                return (
                  <li key={facility.name}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Collapse" : "Expand"} ${facility.name}`}
                        onClick={() => toggleExpanded(facility.name)}
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                      <Checkbox
                        id={facilityId}
                        checked={checked}
                        onCheckedChange={() =>
                          toggleFacility(facility, checked === true)
                        }
                      />
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: colorOf(facility.name) }}
                      />
                      <label
                        htmlFor={facilityId}
                        className="cursor-pointer text-sm"
                      >
                        {facility.name}
                      </label>
                    </div>
                    {isOpen && (
                      <ul className="mt-1 ml-6 flex flex-col gap-1 border-l pl-3">
                        {facility.pipelines.map((pipeline, pipelineIndex) => {
                          const token = selectionToken(facility.name, pipeline)
                          const id = `${facilityId}-pipeline-${pipelineIndex}`
                          return (
                            <li key={token} className="flex items-center gap-2">
                              <Checkbox
                                id={id}
                                checked={selected.has(token)}
                                onCheckedChange={() => togglePipeline(token)}
                              />
                              <label
                                htmlFor={id}
                                className="cursor-pointer text-xs text-muted-foreground"
                              >
                                {pipeline}
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
