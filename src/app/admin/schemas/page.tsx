'use client'

import { useEffect, useState } from 'react'
import { Database, RefreshCw, Key, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

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

export default function SchemasPage() {
  const [schemas, setSchemas] = useState<DbSchema[]>([])
  const [stats, setStats] = useState<CollectionStat[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/schemas')
      const data = await res.json()
      setSchemas(data.schemas || [])
      setStats(data.collectionStats || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const getStatCount = (name: string) => stats.find(s => s.name === name)?.count ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Database Schema</h1>
          <p className="text-muted-foreground mt-1">MongoDB collection schemas and documentation</p>
        </div>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Collection Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          stats.map((stat) => (
            <Card key={stat.name} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{stat.count}</p>
                <p className="text-xs text-muted-foreground mt-1 capitalize">{stat.name}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Schema Cards */}
      <div className="space-y-6">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
              <CardContent><Skeleton className="h-40 w-full" /></CardContent>
            </Card>
          ))
        ) : (
          schemas.map((schema) => {
            const fields: SchemaField[] = JSON.parse(schema.fields || '[]')
            const indexes: SchemaIndex[] = JSON.parse(schema.indexes || '[]')
            const docCount = getStatCount(schema.collection)

            return (
              <Card key={schema._id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Database className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-mono">{schema.collection}</CardTitle>
                        <CardDescription className="mt-0.5">{schema.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <FileText className="h-3 w-3 mr-1" />
                        {docCount} docs
                      </Badge>
                      <Badge variant="secondary" className="text-xs">v{schema.version}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Field</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Type</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Required</th>
                          <th className="text-left py-2 px-3 font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field) => (
                          <tr key={field.name} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                            <td className="py-2 px-3 font-mono text-xs font-medium">{field.name}</td>
                            <td className="py-2 px-3">
                              <Badge variant="secondary" className="text-xs font-mono">{field.type}</Badge>
                            </td>
                            <td className="py-2 px-3">
                              {field.required ? (
                                <Badge className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 border-0">Required</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">Optional</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">{field.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {indexes.length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Key className="h-4 w-4 text-amber-500" />
                          Indexes
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {indexes.map((index) => (
                            <Badge key={index.field} variant="outline" className="text-xs font-mono">
                              {index.field}
                              <span className="ml-1 text-amber-500">({index.type})</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Created: {new Date(schema.createdAt).toLocaleString()}</span>
                    <span>Updated: {new Date(schema.updatedAt).toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
