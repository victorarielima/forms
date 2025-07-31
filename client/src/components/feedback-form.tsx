import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Upload, X, AlertTriangle, FileText, Image, Video, Bug, Lightbulb, MessageSquare } from "lucide-react";
import filazeroLogo from "@assets/logo-filazero_1753880542098.png";

const feedbackSchema = z.object({
  companyName: z.string().min(1, "Nome da empresa é obrigatório"),
  description: z.string().optional(),
  impactLevel: z.string().optional(),
  feedbackType: z.string().min(1, "Tipo de feedback é obrigatório"),
});

type FeedbackFormData = z.infer<typeof feedbackSchema>;

const impactOptions = [
  { value: "baixo", label: "Baixo - Melhoria menor" },
  { value: "medio", label: "Médio - Impacta algumas funcionalidades" },
  { value: "alto", label: "Alto - Impacta funcionalidades principais" },
  { value: "critico", label: "Crítico - Bloqueia o uso da plataforma" },
];

const feedbackOptions = [
  { value: "bug", label: "🐛 Bug (Erro ou falha no sistema)" },
  { value: "sugestao", label: "💡 Sugestão (Melhoria ou nova funcionalidade)" },
];

type FeedbackCategory = "bug" | "sugestao" | null;

export default function FeedbackForm() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>(null);
  const { toast } = useToast();

  const form = useForm<FeedbackFormData>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      companyName: "",
      description: "",
      impactLevel: "",
      feedbackType: "",
    },
  });

  // Update form when category changes
  const handleCategorySelect = (category: FeedbackCategory) => {
    setFeedbackCategory(category);
    form.setValue("feedbackType", category || "");
    // Force form revalidation
    form.trigger("feedbackType");
  };

  const submitFeedback = useMutation({
    mutationFn: async (data: FeedbackFormData & { files?: File[] }) => {
      const formData = new FormData();
      formData.append("companyName", data.companyName);
      if (data.description) formData.append("description", data.description);
      if (data.impactLevel) formData.append("impactLevel", data.impactLevel);
      formData.append("feedbackType", data.feedbackType);
      if (data.files && data.files.length > 0) {
        data.files.forEach((file) => {
          formData.append('files', file);
        });
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
      });

      let result;
      try {
        result = await response.json();
      } catch {
        result = {};
      }
      if (!response.ok) {
        throw new Error(result.message || "Erro ao enviar feedback");
      }
      return result;
    },
    onSuccess: () => {
      const isBug = feedbackCategory === "bug";
      const title = isBug ? "Bug reportado com sucesso!" : "Sugestão enviada com sucesso!";
      const description = isBug 
        ? "Obrigado por reportar este problema! Nossa equipe foi notificada e começará a trabalhar na correção o mais rápido possível."
        : "Obrigado pela sua sugestão! Nossa equipe irá analisar e trabalhar nas melhorias propostas.";
      
      toast({
        title,
        description,
        duration: 6000,
      });
      form.reset();
      setSelectedFiles([]);
      setFeedbackCategory(null);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  const onSubmit = (data: FeedbackFormData) => {
    submitFeedback.mutate({ ...data, files: selectedFiles.length > 0 ? selectedFiles : undefined });
  };

  const handleFileSelect = (files: FileList) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/', 'video/'];
    const validFiles: File[] = [];

    Array.from(files).forEach(file => {
      if (file.size > maxSize) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name}: Tamanho máximo 10MB`,
          variant: "destructive",
        });
        return;
      }

      if (!allowedTypes.some(type => file.type.startsWith(type))) {
        toast({
          title: "Tipo de arquivo não permitido",
          description: `${file.name}: Use apenas imagens ou vídeos`,
          variant: "destructive",
        });
        return;
      }

      validFiles.push(file);
    });

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="h-5 w-5" />;
    if (file.type.startsWith('video/')) return <Video className="h-5 w-5" />;
    return <FileText className="h-5 w-5" />;
  };

  // Category selection modal
  if (!feedbackCategory) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <Card className="w-full max-w-md bg-white shadow-2xl animate-slide-up">
          <CardContent className="p-8">
            {/* Logo */}
            <div className="text-center mb-6">
              <img 
                src={filazeroLogo} 
                alt="Filazero Logo" 
                className="h-10 w-auto mx-auto mb-4" 
              />
              <h2 className="text-lg font-bold text-[var(--color-header)] mb-2">
                Como podemos ajudar você?
              </h2>
              <p className="text-sm text-[var(--color-test-notice-text)] opacity-80">
                Selecione o tipo de feedback que deseja enviar
              </p>
            </div>

            {/* Options */}
            <div className="space-y-4">
              {/* Bug Option */}
              <button
                onClick={() => handleCategorySelect("bug")}
                className="w-full p-4 border-2 border-[var(--color-input-border)] rounded-lg hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-all duration-300 text-left group"
              >
                <div className="flex items-start space-x-4">
                  <div className="p-2 bg-[var(--color-primary-light)] rounded-lg group-hover:bg-[var(--color-primary)] group-hover:text-white transition-colors">
                    <Bug className="h-6 w-6 text-[var(--color-primary)] group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--color-header)] mb-1">
                      Reportar um bug
                    </h3>
                    <p className="text-sm text-[var(--color-test-notice-text)] opacity-80">
                      Algo está quebrado? Conte-nos!
                    </p>
                  </div>
                </div>
              </button>

              {/* Suggestion Option */}
              <button
                onClick={() => handleCategorySelect("sugestao")}
                className="w-full p-4 border-2 border-[var(--color-input-border)] rounded-lg hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-all duration-300 text-left group"
              >
                <div className="flex items-start space-x-4">
                  <div className="p-2 bg-[var(--color-primary-light)] rounded-lg group-hover:bg-[var(--color-primary)] group-hover:text-white transition-colors">
                    <Lightbulb className="h-6 w-6 text-[var(--color-primary)] group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--color-header)] mb-1">
                      Sugerir melhorias
                    </h3>
                    <p className="text-sm text-[var(--color-test-notice-text)] opacity-80">
                      O que podemos fazer melhor?
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get dynamic labels based on category
  const getLabels = () => {
    if (feedbackCategory === "bug") {
      return {
        description: "Descreva o problema que você encontrou:",
        impactLabel: "Qual a gravidade deste problema?",
        fileLabel: "Anexe uma imagem ou vídeo mostrando o problema:",
      };
    } else {
      return {
        description: "Descreva sua sugestão de melhoria:",
        impactLabel: "Qual seria o impacto desta melhoria?",
        fileLabel: "Anexe uma imagem ou vídeo relacionado à sua sugestão:",
      };
    }
  };

  const labels = getLabels();

  return (
    <>
      {/* Main Form Card */}
      <Card className="filazero-card animate-slide-up shadow-xl">
        <CardContent className="p-6">
          {/* Header with Logo */}
          <div className="text-center mb-6">
            <div className="inline-block mb-4">
              <img 
                src={filazeroLogo} 
                alt="Filazero Logo" 
                className="h-8 w-auto sm:h-10 md:h-12 object-contain cursor-pointer transition-transform duration-300 hover:scale-110" 
                style={{ imageRendering: 'auto', maxWidth: '100%' }}
              />
            </div>
            <div className="mb-4 text-center">
              <p className="text-xs text-[var(--color-test-notice-text)] opacity-80">
                Notou algum erro ou tem uma ideia para melhorar a plataforma? Preencha o formulário abaixo — sua contribuição faz toda a diferença! 💜
              </p>
            </div>
          </div>

          {/* Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Company Name Field */}
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-[var(--color-label)]">
                      Nome da empresa
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="filazero-input form-input"
                        placeholder="Digite o nome da sua empresa"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description Field */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-[var(--color-label)]">
                      {labels.description}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="filazero-input form-input resize-none"
                        rows={4}
                        placeholder={
                          feedbackCategory === "bug" 
                            ? "Descreva detalhadamente o problema que você encontrou..."
                            : "Descreva sua ideia ou sugestão de melhoria..."
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Impact Level Field */}
              <FormField
                control={form.control}
                name="impactLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-[var(--color-label)]">
                      {labels.impactLabel}
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="filazero-input form-input">
                          <SelectValue placeholder={
                            feedbackCategory === "bug" 
                              ? "Selecione a gravidade do problema..."
                              : "Selecione o impacto da melhoria..."
                          } />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {impactOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* File Upload Field */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-label)]">
                  {labels.fileLabel}
                </label>
                <div
                  className={`file-drop-zone border-2 border-dashed rounded-lg p-6 text-center transition-all duration-300 cursor-pointer ${
                    dragActive 
                      ? 'border-primary bg-[var(--color-primary-light)] scale-102' 
                      : 'border-border hover:border-primary hover:bg-[var(--color-primary-light)]'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('fileInput')?.click()}
                >
                  <input
                    id="fileInput"
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                  />
                  
                  {selectedFiles.length > 0 ? (
                    <div className="space-y-2">
                      {selectedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-[var(--color-primary-light)] p-3 rounded-lg">
                          <div className="flex items-center space-x-3">
                            {getFileIcon(file)}
                            <div className="text-left">
                              <p className="text-sm font-medium text-foreground">{file.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(index);
                            }}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="text-center pt-2">
                        <p className="text-xs text-muted-foreground">
                          Clique para adicionar mais arquivos
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-8 w-8 text-primary mx-auto animate-bounce-subtle" />
                      <p className="text-sm text-foreground font-medium">
                        Clique para selecionar ou arraste um arquivo
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG, GIF, MP4 (máx. 10MB cada) - Múltiplos arquivos
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Category Display (Hidden Field) */}
              <div className="flex items-center space-x-2 p-3 bg-[var(--color-primary-light)] rounded-lg">
                {feedbackCategory === "bug" ? (
                  <Bug className="h-5 w-5 text-[var(--color-primary)]" />
                ) : (
                  <Lightbulb className="h-5 w-5 text-[var(--color-primary)]" />
                )}
                <span className="text-sm font-medium text-[var(--color-primary)]">
                  {feedbackCategory === "bug" ? "Bug (Erro ou falha no sistema)" : "Sugestão (Melhoria ou nova funcionalidade)"}
                </span>
                <button
                  type="button"
                  onClick={() => setFeedbackCategory(null)}
                  className="ml-auto text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="filazero-button submit-btn"
                disabled={submitFeedback.isPending}
              >
                {submitFeedback.isPending ? (
                  <div className="flex items-center space-x-2">
                    <div className="loading-spinner w-5 h-5" />
                    <span>Enviando...</span>
                  </div>
                ) : (
                  "Enviar Feedback"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
