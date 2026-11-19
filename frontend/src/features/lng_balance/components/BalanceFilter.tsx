import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { FilterNode } from "@/features/lng_balance/api"
import { leaves } from "@/features/lng_balance/utils"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  /** Colour of the title, red for loading source and green for destination. */
  titleClassName?: string
  nodes: FilterNode[]
  /** Selected countries. Nothing selected means all of them. */
  selected: Set<string>
  onChange: (next: Set<string>) => void
}

type NodeProps = {
  node: FilterNode
  path: string
  depth: number
  selected: Set<string>
  expanded: Set<string>
  onToggleExpanded: (path: string) => void
  onToggleNode: (node: FilterNode, allSelected: boolean) => void
}

function TreeNode({
  node,
  path,
  depth,
  selected,
  expanded,
  onToggleExpanded,
  onToggleNode,
}: NodeProps) {
  const countries = leaves(node)
  const count = countries.filter((c) => selected.has(c)).length
  const checked =
    count === countries.length ? true : count > 0 ? "indeterminate" : false
  const isLeaf = node.children.length === 0
  const isOpen = expanded.has(path)
  const id = `balance-filter-${path}`

  return (
    <li>
      <div
        className="flex items-center gap-1.5"
        style={{ paddingLeft: depth * 14 }}
      >
        {isLeaf ? (
          <span className="size-4 shrink-0" />
        ) : (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`}
            onClick={() => onToggleExpanded(path)}
          >
            {isOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        )}
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={() => onToggleNode(node, checked === true)}
        />
        <label
          htmlFor={id}
          className={cn("cursor-pointer text-sm", isLeaf && "text-xs")}
        >
          {node.name}
        </label>
      </div>
      {!isLeaf && isOpen && (
        <ul className="mt-1 flex flex-col gap-1">
          {node.children.map((child) => (
            <TreeNode
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              onToggleExpanded={onToggleExpanded}
              onToggleNode={onToggleNode}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/** A region and country tree with tri-state checkboxes. Nothing ticked means every country. */
export function BalanceFilter({
  title,
  titleClassName,
  nodes,
  selected,
  onChange,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpanded = (path: string) => {
    const next = new Set(expanded)
    if (!next.delete(path)) next.add(path)
    setExpanded(next)
  }

  const toggleNode = (node: FilterNode, allSelected: boolean) => {
    const next = new Set(selected)
    for (const country of leaves(node)) {
      if (allSelected) next.delete(country)
      else next.add(country)
    }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className={cn("text-sm font-semibold", titleClassName)}>{title}</h2>
        {selected.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange(new Set())}>
            Clear
          </Button>
        )}
      </div>
      <ul className="flex max-h-[calc(100vh-16rem)] min-h-40 flex-col gap-1 overflow-y-auto pr-1">
        {nodes.map((node) => (
          <TreeNode
            key={node.name}
            node={node}
            path={node.name}
            depth={0}
            selected={selected}
            expanded={expanded}
            onToggleExpanded={toggleExpanded}
            onToggleNode={toggleNode}
          />
        ))}
      </ul>
    </div>
  )
}
