import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import Gallery from "./pages/Gallery";
import Channels from "./pages/Channels";
import ThumbnailWorkflow from "./pages/ThumbnailWorkflow";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              }
            />
            <Route
              path="/chat"
              element={
                <AppLayout>
                  <Chat />
                </AppLayout>
              }
            />
            <Route
              path="/gallery"
              element={
                <AppLayout>
                  <Gallery />
                </AppLayout>
              }
            />
            <Route
              path="/channels"
              element={
                <AppLayout>
                  <Channels />
                </AppLayout>
              }
            />
            <Route
              path="/create"
              element={
                <AppLayout>
                  <ThumbnailWorkflow />
                </AppLayout>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
