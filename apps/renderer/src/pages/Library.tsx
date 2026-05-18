import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Plus, Upload, Search, FileText } from "lucide-react";

interface Collection {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface DocumentItem {
  id: string;
  filename: string;
  status: string;
  chunk_count: number | null;
  created_at: string;
}

export function Library() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ documentId: string; text: string; score: number }>>([]);

  const loadCollections = useCallback(async () => {
    const cols = await api.documents.getCollections();
    setCollections(cols);
  }, []);

  const loadDocuments = useCallback(async (collectionId: string) => {
    const docs = await api.documents.getDocuments(collectionId);
    setDocuments(docs);
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    if (selectedCollection) {
      loadDocuments(selectedCollection);
    } else {
      setDocuments([]);
    }
  }, [selectedCollection, loadDocuments]);

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    await api.documents.createCollection(newCollectionName.trim());
    setNewCollectionName("");
    await loadCollections();
  };

  const handleDeleteCollection = async (id: string) => {
    await api.documents.deleteCollection(id);
    if (selectedCollection === id) setSelectedCollection(null);
    await loadCollections();
  };

  const handleImport = async () => {
    if (!selectedCollection) return;
    await api.documents.importFiles(selectedCollection);
    await loadDocuments(selectedCollection);
  };

  const handleDeleteDocument = async (docId: string) => {
    await api.documents.deleteDocument(docId);
    if (selectedCollection) await loadDocuments(selectedCollection);
  };

  const handleSearch = async () => {
    if (!selectedCollection || !searchQuery.trim()) return;
    const results = await api.documents.search(selectedCollection, searchQuery.trim());
    setSearchResults(results);
  };

  return (
    <div className="flex h-full">
      {/* Collection list */}
      <div className="w-80 border-r flex flex-col" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="p-4 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
          <h2 className="text-lg font-semibold mb-3">知识库</h2>
          <div className="flex gap-2">
            <Input
              placeholder="新建知识库..."
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateCollection()}
            />
            <Button size="icon" onClick={handleCreateCollection}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {collections.map((col) => (
              <button
                key={col.id}
                onClick={() => setSelectedCollection(col.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 flex items-center justify-between group ${
                  selectedCollection === col.id
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span className="truncate">{col.name}</span>
                <Trash2
                  className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 hover:text-red-500 shrink-0"
                  onClick={(e) => { e.stopPropagation(); handleDeleteCollection(col.id); }}
                />
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Document list */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedCollection ? (
          <>
            <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: "var(--sidebar-border)" }}>
              <div className="flex-1 flex gap-2">
                <Input
                  placeholder="搜索文档内容..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button size="icon" variant="secondary" onClick={handleSearch}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              <Button onClick={handleImport}>
                <Upload className="w-4 h-4 mr-2" />
                上传文件
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              {searchResults.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground">搜索结果</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSearchResults([])}>清除</Button>
                  </div>
                  {searchResults.map((r, i) => (
                    <Card key={i}>
                      <CardContent className="p-3">
                        <div className="text-xs text-muted-foreground mb-1">文档: {r.documentId} · 相关度: {(r.score * 100).toFixed(1)}%</div>
                        <p className="text-sm line-clamp-3">{r.text}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{doc.filename}</div>
                        <div className="text-xs text-muted-foreground">
                          {doc.status === "ready" ? `${doc.chunk_count ?? 0} 个片段` : doc.status}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-7 h-7 shrink-0"
                        onClick={() => handleDeleteDocument(doc.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-12">
                      暂无文档，点击右上角上传
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            选择一个知识库或创建新知识库
          </div>
        )}
      </div>
    </div>
  );
}
