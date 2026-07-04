'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import {
  Database,
  Shield,
  Package,
  FolderOpen,
  ShoppingCart,
  Users,
  RefreshCw,
  Server,
  HardDrive,
  Key,
  FileText,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/admin/theme-toggle'
import { useSiteLogo } from '@/hooks/use-site-logo'

interface SchemaField {
  name: string
  type: string
  required: boolean
  description: string
}

interface SchemaIndex {
  field: string
  type: string
}

interface DbSchema {
  _id: string
  collection: string
  description: string
  fields: string
  indexes: string
  version: number
  createdAt: string
  updatedAt: string
}

interface CollectionStat {
  name: string
  count: number
  type: string
}

const collectionIcons: Record<string, React.ElementType> = {
  admins: Shield,
  products: Package,
  categories: FolderOpen,
  orders: ShoppingCart,
  customers: Users,
  dbschemas: Database,
}

const collectionColors: Record<string, { bg: string; text: string; darkText: string }> = {
  admins: { bg: 'bg-rose-500/10', text: 'text-rose-600', darkText: 'dark:text-rose-400' },
  products: { bg: 'bg-primary/10', text: 'text-primary', darkText: '' },
  categories: { bg: 'bg-amber-500/10', text: 'text-amber-600', darkText: 'dark:text-amber-400' },
  orders: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', darkText: 'dark:text-emerald-400' },
  customers: { bg: 'bg-sky-500/10', text: 'text-sky-600', darkText: 'dark:text-sky-400' },
  dbschemas: { bg: 'bg-violet-500/10', text: 'text-violet-600', darkText: 'dark:text-violet-400' },
}

export default function HomePage() {
  const { logo } = useSiteLogo()
  const [schemas, setSchemas] = useState<DbSchema[]>([])
  const [stats, setStats] = useState<CollectionStat[]>([])
  const [loading, setLoading] = useState(true)
  const [seeded, setSeeded] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/schemas')
      const data = await res.json().catch(() => ({}))
      setSchemas(data.schemas || [])
      setStats(data.collectionStats || [])
    } catch {
      // Database might not be seeded yet
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      await fetch('/api/seed', { method: 'POST' })
      setSeeded(true)
      fetchData()
    } catch {
      // ignore
    } finally {
      setSeeding(false)
    }
  }

  const totalDocuments = stats.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logo ? (
              <div className="flex items-center justify-center w-9 h-9 shrink-0">
                <Image
                  src={logo.url}
                  alt="Site Logo"
                  width={36}
                  height={36}
                  className="w-full h-full object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25 text-primary-foreground font-bold text-sm">
                RC
              </div>
            )}
            <div>
              <h1 className="font-semibold text-lg leading-tight tracking-tight">RealCart</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">Database Schema Documentation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-primary/3 to-accent/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-primary/8 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-5">
              <Badge variant="secondary" className="text-xs px-3 py-1 rounded-lg bg-primary/10 text-primary border-primary/20">
                <Server className="h-3 w-3 mr-1.5" />
                MongoDB Atlas
              </Badge>
              <Badge variant="outline" className="text-xs px-3 py-1 rounded-lg">
                <Database className="h-3 w-3 mr-1.5" />
                Cluster0
              </Badge>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              RealCart Database Schema
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg mb-8 leading-relaxed">
              Complete MongoDB database schema documentation for the RealCart e-commerce platform.
              Browse collections, field definitions, indexes, and relationships.
            </p>
            <div className="flex flex-wrap gap-3">
              {!loading && schemas.length === 0 && (
                <Button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="rounded-xl bg-gradient-to-r from-primary via-primary to-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5"
                >
                  {seeding ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4 mr-2" />
                  )}
                  {seeding ? 'Initializing...' : 'Initialize Database'}
                </Button>
              )}
              {seeded && (
                <Badge variant="default" className="bg-emerald-600 text-white px-3 py-1 rounded-lg">
                  <CheckCircle2 className="h-3 w-3 mr-1.5" />
                  Database Initialized
                </Badge>
              )}
              <Button variant="outline" onClick={fetchData} disabled={loading} className="rounded-xl">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Overview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="shadow-lg shadow-primary/5 border-border/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10">
                <Database className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.length}</p>
                <p className="text-xs text-muted-foreground">Collections</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-lg shadow-primary/5 border-border/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-500/10">
                <FileText className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalDocuments}</p>
                <p className="text-xs text-muted-foreground">Documents</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-lg shadow-primary/5 border-border/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <Key className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {schemas.reduce((sum, s) => sum + (JSON.parse(s.indexes || '[]') as SchemaIndex[]).length, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Indexes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-lg shadow-primary/5 border-border/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-0.5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-violet-500/10">
                <HardDrive className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {schemas.reduce((sum, s) => sum + (JSON.parse(s.fields || '[]') as SchemaField[]).length, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total Fields</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Schema Documentation */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-6">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="border-border/50">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-5 w-40 bg-muted rounded-lg animate-pulse" />
                      <div className="h-3 w-64 bg-muted rounded-lg animate-pulse" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} className="h-10 bg-muted rounded-lg animate-pulse" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : schemas.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="py-20 text-center">
                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-xl" />
                  <Database className="relative h-12 w-12 mx-auto text-primary/60" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Schema Documentation Yet</h3>
                <p className="text-muted-foreground mb-6">Initialize the database to create collections and schema documentation.</p>
                <Button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="rounded-xl bg-gradient-to-r from-primary via-primary to-primary/90 shadow-lg shadow-primary/25"
                >
                  <Database className="h-4 w-4 mr-2" />
                  Initialize Database
                </Button>
              </CardContent>
            </Card>
          ) : (
            schemas.map((schema) => {
              const fields: SchemaField[] = JSON.parse(schema.fields || '[]')
              const indexes: SchemaIndex[] = JSON.parse(schema.indexes || '[]')
              const IconComp = collectionIcons[schema.collection] || Database
              const colors = collectionColors[schema.collection] || { bg: 'bg-primary/10', text: 'text-primary', darkText: '' }
              const docCount = stats.find(s => s.name === schema.collection)?.count ?? 0

              return (
                <Card key={schema._id} id={schema.collection} className="overflow-hidden border-border/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`p-2.5 rounded-xl ${colors.bg} shrink-0`}>
                          <IconComp className={`h-6 w-6 ${colors.text} ${colors.darkText}`} />
                        </div>
                        <div>
                          <CardTitle className="text-xl font-mono tracking-tight">{schema.collection}</CardTitle>
                          <CardDescription className="mt-1">{schema.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs rounded-lg">
                          <FileText className="h-3 w-3 mr-1" />
                          {docCount} documents
                        </Badge>
                        <Badge variant="secondary" className="text-xs rounded-lg bg-primary/10 text-primary">v{schema.version}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* Fields Table */}
                    <div className="overflow-x-auto rounded-xl border border-border/50">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40">
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Field Name</th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">BSON Type</th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Constraint</th>
                            <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs uppercase tracking-wider">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((field, i) => (
                            <tr key={field.name} className={`${i !== fields.length - 1 ? 'border-b border-border/30' : ''} hover:bg-accent/30 transition-colors`}>
                              <td className="py-3 px-4">
                                <code className="text-xs font-mono bg-primary/8 text-primary px-2 py-1 rounded-md">{field.name}</code>
                              </td>
                              <td className="py-3 px-4">
                                <Badge variant="secondary" className="text-xs font-mono rounded-md bg-secondary/80">{field.type}</Badge>
                              </td>
                              <td className="py-3 px-4">
                                {field.required ? (
                                  <Badge className="text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 border-0 rounded-md">Required</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">Optional</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-xs text-muted-foreground">{field.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Indexes */}
                    {indexes.length > 0 && (
                      <div className="mt-5">
                        <h4 className="text-sm font-medium mb-2.5 flex items-center gap-2">
                          <Key className="h-4 w-4 text-amber-500" />
                          Indexes
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {indexes.map((index) => (
                            <Badge key={index.field} variant="outline" className="text-xs font-mono py-1 px-2.5 rounded-lg">
                              {index.field}
                              <span className="ml-1.5 text-amber-500 font-semibold">({index.type})</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="mt-5 pt-3 border-t border-border/30 flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Created: {new Date(schema.createdAt).toLocaleString()}</span>
                      <span>Updated: {new Date(schema.updatedAt).toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-2.5">
            {logo ? (
              <div className="w-6 h-6 shrink-0">
                <Image
                  src={logo.url}
                  alt="Site Logo"
                  width={24}
                  height={24}
                  className="w-full h-full object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center text-xs font-bold">
                RC
              </div>
            )}
            <span className="text-sm text-muted-foreground">RealCart Database Schema Documentation</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
