'use client'

import { useAdminAuth } from '@/hooks/use-admin-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  X,
  CheckCircle2,
  Ruler,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  Lock,
  Unlock,
  Columns3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AdminModal, {
  AdminDeleteModal,
  ModalCancelButton,
  ModalSubmitButton,
} from '@/components/admin/admin-modal'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface SizeChartTemplate {
  _id: string
  name: string
  description: string
  headers: string[]
  rows: Record<string, string>[]
  unit: 'metric' | 'imperial' | 'both'
  conversionFactor?: number
  sizeHeader: string
  howToMeasure?: string[]
  isSystem?: boolean
  status: string
  createdAt?: string
  updatedAt?: string
}

/* ------------------------------------------------------------------ */
/*  Animation Variants                                                   */
/* ------------------------------------------------------------------ */

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const } },
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const UNITS: Array<'metric' | 'imperial' | 'both'> = ['imperial', 'metric', 'both']
const UNIT_LABELS: Record<string, string> = { imperial: 'Inches', metric: 'Centimeters', both: 'Both' }

/* ------------------------------------------------------------------ */
/*  Page Component                                                      */
/* ------------------------------------------------------------------ */

export default function AdminSizeChartsPage() {
  const { authenticated, loading: authLoading } = useAdminAuth()
  const router = useRouter()

  // State
  const [templates, setTemplates] = useState<SizeChartTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [viewTemplate, setViewTemplate] = useState<SizeChartTemplate | null>(null)
  const [editTemplate, setEditTemplate] = useState<SizeChartTemplate | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTemplate, setDeleteTemplate] = useState<SizeChartTemplate | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    unit: 'imperial' as 'metric' | 'imperial' | 'both',
    sizeHeader: 'Size',
    headers: ['Size', 'Chest (in)', 'Waist (in)', 'Length (in)'],
    rows: [] as Record<string, string>[],
    howToMeasure: [] as string[],
    status: 'Active',
  })

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      // Admin page: send 'all' when no status filter so we see all templates
      params.set('status', filterStatus || 'all')
      const res = await fetch(`/api/size-chart-templates?${params}`)
      const data = await res.json().catch(() => ({}))
      if (data.templates) {
        setTemplates(data.templates)
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => {
    if (authenticated) fetchTemplates()
  }, [authenticated, fetchTemplates])

  // Filter templates by search
  const filteredTemplates = templates.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
  })

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      unit: 'imperial',
      sizeHeader: 'Size',
      headers: ['Size', 'Chest (in)', 'Waist (in)', 'Length (in)'],
      rows: [],
      howToMeasure: [],
      status: 'Active',
    })
  }

  // Open create modal
  const openCreate = () => {
    resetForm()
    setCreateOpen(true)
  }

  // Open edit modal
  const openEdit = (template: SizeChartTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      unit: template.unit,
      sizeHeader: template.sizeHeader,
      headers: [...template.headers],
      rows: template.rows.map(r => ({ ...r })),
      howToMeasure: template.howToMeasure ? [...template.howToMeasure] : [],
      status: template.status,
    })
    setEditTemplate(template)
  }

  // Handle create
  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Template name is required', variant: 'destructive' })
      return
    }
    if (formData.headers.length === 0) {
      toast({ title: 'Error', description: 'At least one header is required', variant: 'destructive' })
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/size-chart-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await res.json().catch(() => ({}))
      if (data.success) {
        toast({ title: 'Template Created', description: `"${formData.name}" has been created` })
        setCreateOpen(false)
        resetForm()
        fetchTemplates()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to create template', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle update
  const handleUpdate = async () => {
    if (!editTemplate) return
    try {
      setSubmitting(true)
      const res = await fetch('/api/size-chart-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: editTemplate._id, ...formData }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.success) {
        toast({ title: 'Template Updated', description: `"${formData.name}" has been updated` })
        setEditTemplate(null)
        resetForm()
        fetchTemplates()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update template', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTemplate) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/size-chart-templates?id=${deleteTemplate._id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (data.success) {
        toast({ title: 'Template Deleted', description: `"${deleteTemplate.name}" has been deleted` })
        setDeleteTemplate(null)
        fetchTemplates()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to delete template', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle remove system marking
  const handleRemoveSystemMarking = async (template: SizeChartTemplate) => {
    try {
      const res = await fetch('/api/size-chart-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: template._id, isSystem: false }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.success) {
        toast({ title: 'System Marking Removed', description: `"${template.name}" is now a custom template and can be deleted` })
        fetchTemplates()
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to remove system marking', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    }
  }

  // Size chart table helpers
  const addHeader = () => {
    setFormData(prev => ({
      ...prev,
      headers: [...prev.headers, `Column ${prev.headers.length + 1} (in)`],
    }))
  }

  const removeHeader = (index: number) => {
    if (index === 0) return // Can't remove size column
    const header = formData.headers[index]
    setFormData(prev => ({
      ...prev,
      headers: prev.headers.filter((_, i) => i !== index),
      rows: prev.rows.map(row => {
        const newRow = { ...row }
        delete newRow[header]
        return newRow
      }),
    }))
  }

  const updateHeader = (index: number, value: string) => {
    const oldHeader = formData.headers[index]
    setFormData(prev => ({
      ...prev,
      headers: prev.headers.map((h, i) => i === index ? value : h),
      rows: prev.rows.map(row => {
        const newRow: Record<string, string> = {}
        for (const [k, v] of Object.entries(row)) {
          newRow[k === oldHeader ? value : k] = v
        }
        return newRow
      }),
    }))
  }

  const addRow = () => {
    const newRow: Record<string, string> = {}
    formData.headers.forEach(h => { newRow[h] = '' })
    setFormData(prev => ({ ...prev, rows: [...prev.rows, newRow] }))
  }

  const removeRow = (index: number) => {
    setFormData(prev => ({ ...prev, rows: prev.rows.filter((_, i) => i !== index) }))
  }

  const updateCell = (rowIndex: number, header: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      rows: prev.rows.map((row, i) => i === rowIndex ? { ...row, [header]: value } : row),
    }))
  }

  const addHowToMeasure = () => {
    setFormData(prev => ({ ...prev, howToMeasure: [...prev.howToMeasure, ''] }))
  }

  const removeHowToMeasure = (index: number) => {
    setFormData(prev => ({ ...prev, howToMeasure: prev.howToMeasure.filter((_, i) => i !== index) }))
  }

  const updateHowToMeasure = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      howToMeasure: prev.howToMeasure.map((t, i) => i === index ? value : t),
    }))
  }

  // Form modal content (shared between create and edit)
  const formContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Name *</Label>
          <Input
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., Men's T-Shirts"
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Unit</Label>
          <Select value={formData.unit} onValueChange={v => setFormData(prev => ({ ...prev, unit: v as 'metric' | 'imperial' | 'both' }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map(u => <SelectItem key={u} value={u}>{UNIT_LABELS[u]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          value={formData.description}
          onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Brief description of this size chart template"
          className="text-xs min-h-[60px]"
          rows={2}
        />
      </div>

      {/* Size Chart Table Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Chart Structure</Label>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={addHeader}>
              <Columns3 className="h-3 w-3" /> Add Column
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={addRow}>
              <PlusCircle className="h-3 w-3" /> Add Row
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/50">
                {formData.headers.map((h, i) => (
                  <th key={i} className="p-1.5 text-left">
                    <div className="flex items-center gap-1">
                      <Input
                        value={h}
                        onChange={e => updateHeader(i, e.target.value)}
                        className={cn('h-6 text-[11px] font-medium', i === 0 && 'font-bold bg-muted/30')}
                        disabled={i === 0}
                      />
                      {i > 0 && (
                        <button onClick={() => removeHeader(i)} className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-destructive">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="w-7"></th>
              </tr>
            </thead>
            <tbody>
              {formData.rows.map((row, ri) => (
                <tr key={ri} className={cn(ri % 2 === 0 ? '' : 'bg-muted/10')}>
                  {formData.headers.map(h => (
                    <td key={h} className="p-1">
                      <Input
                        value={row[h] || ''}
                        onChange={e => updateCell(ri, h, e.target.value)}
                        className={cn('h-6 text-[11px]', h === formData.headers[0] && 'font-medium bg-muted/20')}
                        placeholder={h === formData.headers[0] ? 'Size' : ''}
                      />
                    </td>
                  ))}
                  <td className="p-1">
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeRow(ri)}>
                      <MinusCircle className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {formData.rows.length === 0 && (
                <tr>
                  <td colSpan={formData.headers.length + 1} className="p-3 text-center text-muted-foreground text-[11px]">
                    No rows yet. Click &quot;Add Row&quot; to add measurement data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* How to Measure */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">How to Measure Tips</Label>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={addHowToMeasure}>
            <PlusCircle className="h-3 w-3" /> Add Tip
          </Button>
        </div>
        {formData.howToMeasure.map((tip, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-muted-foreground/50 text-[10px]">&#8226;</span>
            <Input
              value={tip}
              onChange={e => updateHowToMeasure(i, e.target.value)}
              className="h-6 text-[11px] flex-1"
              placeholder="e.g., Chest: Measure around the fullest part"
            />
            <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive flex-shrink-0" onClick={() => removeHowToMeasure(i)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {formData.howToMeasure.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">No tips added yet.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Size Header Label</Label>
          <Input
            value={formData.sizeHeader}
            onChange={e => setFormData(prev => ({ ...prev, sizeHeader: e.target.value }))}
            className="h-8 text-xs"
            placeholder="e.g., Size, UK Size"
          />
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={formData.status} onValueChange={v => setFormData(prev => ({ ...prev, status: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  // Auth guard
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!authenticated) {
    router.push('/admin/login')
    return null
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Ruler className="h-5 w-5 text-emerald-500" />
            Size Chart Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage size chart templates for products
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTemplates} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-3.5 w-3.5" /> New Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Select value={filterStatus || '__all__'} onValueChange={v => setFilterStatus(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-9 w-[120px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs">
          {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-16">
          <Ruler className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-muted-foreground">No templates found</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {search || filterStatus
              ? 'Try adjusting your filters'
              : 'Create your first size chart template'}
          </p>
          {!search && !filterStatus && (
            <Button size="sm" onClick={openCreate} className="mt-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-3.5 w-3.5" /> New Template
            </Button>
          )}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {filteredTemplates.map(template => (
            <motion.div
              key={template._id}
              variants={fadeInUp}
              className="border rounded-lg p-4 hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold truncate">{template.name}</h3>
                    {template.isSystem ? (
                      <Badge variant="secondary" className="text-[9px] gap-0.5">
                        <Lock className="h-2.5 w-2.5" /> System
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px]">Custom</Badge>
                    )}
                    <Badge variant={template.status === 'Active' ? 'default' : 'secondary'} className="text-[9px]">
                      {template.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                    {template.description || 'No description'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{UNIT_LABELS[template.unit] || template.unit}</span>
                    <span>&#8226; {template.headers.length} columns</span>
                    <span>&#8226; {template.rows.length} sizes</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewTemplate(template)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(template)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {template.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-950/30"
                      onClick={() => handleRemoveSystemMarking(template)}
                      title="Remove system marking"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {!template.isSystem && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTemplate(template)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Mini preview */}
              {template.headers.length > 0 && template.rows.length > 0 && (
                <div className="mt-3 overflow-x-auto border rounded">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="bg-muted/40">
                        {template.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {template.rows.slice(0, 3).map((row, i) => (
                        <tr key={i} className={cn(i % 2 === 1 && 'bg-muted/20')}>
                          {template.headers.map((h, j) => (
                            <td key={j} className="px-2 py-1 whitespace-nowrap">{row[h] || '\u2014'}</td>
                          ))}
                        </tr>
                      ))}
                      {template.rows.length > 3 && (
                        <tr>
                          <td colSpan={template.headers.length} className="px-2 py-1 text-center text-muted-foreground">
                            +{template.rows.length - 3} more sizes
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* View Template Modal */}
      {viewTemplate && (
        <AdminModal
          open={!!viewTemplate}
          onOpenChange={() => setViewTemplate(null)}
          type="view"
          size="lg"
          title={viewTemplate.name}
          description={viewTemplate.description || `${UNIT_LABELS[viewTemplate.unit] || viewTemplate.unit}`}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{UNIT_LABELS[viewTemplate.unit] || viewTemplate.unit}</Badge>
              {viewTemplate.isSystem && <Badge variant="secondary" className="gap-0.5"><Lock className="h-2.5 w-2.5" /> System</Badge>}
              <Badge variant={viewTemplate.status === 'Active' ? 'default' : 'secondary'}>{viewTemplate.status}</Badge>
            </div>

            {viewTemplate.headers.length > 0 && viewTemplate.rows.length > 0 && (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      {viewTemplate.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {viewTemplate.rows.map((row, i) => (
                      <tr key={i} className={cn(i % 2 === 1 && 'bg-muted/20')}>
                        {viewTemplate.headers.map((h, j) => (
                          <td key={j} className={cn('px-3 py-2 whitespace-nowrap', j === 0 && 'font-medium')}>{row[h] || '\u2014'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {viewTemplate.howToMeasure && viewTemplate.howToMeasure.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold mb-2">How to Measure</p>
                <div className="space-y-1">
                  {viewTemplate.howToMeasure.map((tip, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5">&#8226;</span>{tip}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Actions for system templates */}
            {viewTemplate.isSystem && (
              <div className="border-t pt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    const t = viewTemplate
                    setViewTemplate(null)
                    openEdit(t)
                  }}
                >
                  <Pencil className="h-3 w-3" /> Edit Template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/30"
                  onClick={async () => {
                    await handleRemoveSystemMarking(viewTemplate)
                    setViewTemplate(null)
                  }}
                >
                  <Unlock className="h-3 w-3" /> Remove System Marking
                </Button>
              </div>
            )}
          </div>
        </AdminModal>
      )}

      {/* Create Template Modal */}
      <AdminModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        type="form"
        size="xl"
        title="Create Size Chart Template"
        description="Create a new size chart template for products"
        footer={
          <>
            <ModalCancelButton onClick={() => setCreateOpen(false)} disabled={submitting} />
            <ModalSubmitButton onClick={handleCreate} submitting={submitting} icon={Plus}>
              Create Template
            </ModalSubmitButton>
          </>
        }
      >
        {formContent}
      </AdminModal>

      {/* Edit Template Modal */}
      <AdminModal
        open={!!editTemplate}
        onOpenChange={() => setEditTemplate(null)}
        type="form"
        size="xl"
        title="Edit Size Chart Template"
        description={editTemplate?.name || ''}
        footer={
          <>
            <ModalCancelButton onClick={() => setEditTemplate(null)} disabled={submitting} />
            <ModalSubmitButton onClick={handleUpdate} submitting={submitting} icon={CheckCircle2}>
              Update Template
            </ModalSubmitButton>
          </>
        }
      >
        {formContent}
      </AdminModal>

      {/* Delete Template Modal */}
      <AdminDeleteModal
        open={!!deleteTemplate}
        onOpenChange={() => setDeleteTemplate(null)}
        title="Delete Template"
        itemName="template"
        name={deleteTemplate?.name || ''}
        warningText="This action cannot be undone. The size chart template will be permanently removed."
        onDelete={handleDelete}
        onCancel={() => setDeleteTemplate(null)}
        submitting={submitting}
      />
    </div>
  )
}
