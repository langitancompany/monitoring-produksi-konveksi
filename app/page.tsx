/*
 * Copyright 2026 [abdllahmajid]
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// app/page.tsx
//
// Kerangka halaman utama: login → sidebar + header + isi tab.
// Untuk menambah halaman baru lihat lib/tabs.ts (daftar tab) dan komentar di
// bagian "Isi tab" di bawah.
"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import dynamic from "next/dynamic";

import { createClient } from "@/lib/supabase/client";
import { ActiveTab, isValidTab } from "@/lib/tabs";

// ─── Hooks ───────────────────────────────────────────────────────────────────
import { useAuth } from "@/hooks/useAuth";
import { useUsers } from "@/hooks/useUsers";
import { useNotifications } from "@/hooks/useNotifications";
import { useOrders } from "@/hooks/useOrders";
import { useProductionTypes } from "@/hooks/useProductionTypes";

// ─── Layout & UI ─────────────────────────────────────────────────────────────
import Sidebar from "@/app/components/layout/Sidebar";
import Header from "@/app/components/layout/Header";
import CustomAlert from "@/app/components/ui/CustomAlert";
import LoginScreen from "@/app/components/auth/LoginScreen";
import ProfileModal from "@/app/components/ui/ProfileModal";
import type { Order, OrderKategori } from "@/types/order";

// ─── Halaman (dimuat saat dibutuhkan) ────────────────────────────────────────
const Spinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-[#49BFB4] border-t-transparent rounded-full animate-spin" />
  </div>
);

const Dashboard = dynamic(() => import("@/app/components/dashboard/Dashboard"), {
  loading: Spinner,
  ssr: false,
});
const SettingsPage = dynamic(
  () => import("@/app/components/settings/SettingsPage"),
  { loading: Spinner },
);
const AboutView = dynamic(() => import("@/app/components/misc/AboutView"));
const OrderList = dynamic(() => import("@/app/components/orders/OrderList"), {
  loading: Spinner,
});
const CreateOrder = dynamic(
  () => import("@/app/components/orders/CreateOrder"),
);
const OrderDetail = dynamic(
  () => import("@/app/components/orders/OrderDetail"),
);

type OrderView = "list" | "detail" | "create";
const isOrderView = (v: string | null): v is OrderView =>
  v === "list" || v === "detail" || v === "create";
const isOrderTab = (t: ActiveTab) => t === "orders_utama" || t === "orders_lain";
const kategoriOf = (t: ActiveTab): OrderKategori =>
  t === "orders_lain" ? "non_utama" : "utama";

export default function KonveksiApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const [view, setView] = useState<OrderView>("list");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "confirm";
    onConfirm?: () => void;
  }>({ isOpen: false, title: "", message: "", type: "success" });

  // Scroll container utama (di-reset ke atas tiap pindah tab)
  const mainRef = useRef<HTMLDivElement>(null);

  // ─── Alert / konfirmasi ────────────────────────────────────────────────────
  const showAlert = useCallback(
    (title: string, message: string, type: "success" | "error" = "success") => {
      setAlertState({ isOpen: true, title, message, type, onConfirm: undefined });
    },
    [],
  );
  const showConfirm = useCallback(
    (title: string, message: string, onConfirm: () => void) => {
      setAlertState({ isOpen: true, title, message, type: "confirm", onConfirm });
    },
    [],
  );
  const closeAlert = useCallback(
    () => setAlertState((prev) => ({ ...prev, isOpen: false })),
    [],
  );

  // Satu client Supabase untuk seluruh halaman (schema & cookie: lib/config.ts)
  const supabase = useMemo(() => createClient(), []);

  // ─── Auth & data ───────────────────────────────────────────────────────────
  const {
    currentUser,
    setCurrentUser,
    loadingUser,
    handleLogout,
    handleUpdateProfile,
  } = useAuth({ supabase, showAlert, showConfirm });

  const { usersList, fetchUsers, handleSaveUser, handleDeleteUser } = useUsers({
    supabase,
    showAlert,
    showConfirm,
  });

  const { notifications, fetchNotifications, markAsRead, markAllAsRead } =
    useNotifications({
      currentUserId: currentUser?.id ?? null,
      supabase,
    });

  const {
    productionTypes,
    activeNonUtama,
    fetchProductionTypes,
    handleSaveType,
    handleToggleType,
    handleDeleteType,
  } = useProductionTypes({ supabase, showAlert, showConfirm });

  const {
    orders,
    utamaOrders,
    nonUtamaOrders,
    ordersLoading,
    ordersError,
    fetchOrders,
    isCreating,
    handleCreateOrder,
  } = useOrders({ supabase, currentUser, fetchNotifications, showAlert });

  // Muat data awal begitu login berhasil
  useEffect(() => {
    if (!currentUser?.id) return;
    void Promise.all([fetchUsers(), fetchOrders(), fetchProductionTypes()]);
  }, [currentUser?.id, fetchUsers, fetchOrders, fetchProductionTypes]);

  const selectedOrder = useMemo(
    () => orders.find((o: Order) => o.id === selectedOrderId),
    [orders, selectedOrderId],
  );

  // Bila nomor WA user yang sedang login diubah lewat Pengaturan → Pengguna,
  // samakan ke currentUser supaya Edit Profil langsung menampilkan nomor terbaru.
  useEffect(() => {
    if (!currentUser) return;
    const me = usersList.find((u) => u.id === currentUser.id);
    if (!me) return;
    const latest = me.no_wa || null;
    if ((currentUser.no_wa || null) !== latest) {
      setCurrentUser((prev) => (prev ? { ...prev, no_wa: latest } : prev));
    }
  }, [usersList, currentUser, setCurrentUser]);

  // ─── Navigasi: tab ikut tersimpan di URL (?tab=...) ────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const v = params.get("view");
    const orderId = params.get("orderId");
    if (isValidTab(tab)) setActiveTab(tab);
    if (isOrderView(v)) setView(v);
    if (orderId) setSelectedOrderId(orderId);
    setIsRestored(true);
  }, []);

  useEffect(() => {
    if (!isRestored) return;
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    if (isOrderTab(activeTab)) {
      params.set("view", view);
      if (selectedOrderId) params.set("orderId", selectedOrderId);
    }
    window.history.pushState(
      { tab: activeTab, view, selectedOrderId },
      "",
      `?${params.toString()}`,
    );
  }, [activeTab, view, selectedOrderId, isRestored]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [activeTab, view, selectedOrderId]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const saveProfile = useCallback(
    (data: unknown) =>
      handleUpdateProfile(data, () => {
        setShowProfileModal(false);
        void fetchUsers(); // sinkronkan daftar di Pengaturan → Pengguna
      }),
    [handleUpdateProfile, fetchUsers],
  );

  const handleNotificationClick = useCallback(
    async (notificationId: string, orderId: string) => {
      await markAsRead(notificationId);
      const target = orders.find((o: Order) => o.id === orderId);
      if (target) {
        setActiveTab(target.kategori === "non_utama" ? "orders_lain" : "orders_utama");
        setView("detail");
        setSelectedOrderId(orderId);
      }
      setSidebarOpen(false);
    },
    [markAsRead, orders],
  );

  // ─── Guards ────────────────────────────────────────────────────────────────
  if (loadingUser)
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-10 h-10 border-4 border-[#49BFB4] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!currentUser) return <LoginScreen />;

  const p = currentUser.permissions;

  // ─── Halaman pesanan (dipakai menu Utama & Non-Utama) ──────────────────────
  const backToList = () => {
    setSelectedOrderId(null);
    setView("list");
  };

  const renderOrders = (tab: ActiveTab) => {
    const kategori = kategoriOf(tab);
    const list = kategori === "utama" ? utamaOrders : nonUtamaOrders;

    if (view === "create") {
      return (
        <CreateOrder
          kategori={kategori}
          nonUtamaTypes={activeNonUtama}
          isSubmitting={isCreating}
          onCancel={backToList}
          onSubmit={async (data) => {
            const created = await handleCreateOrder(data);
            if (created) {
              setSelectedOrderId(created.id);
              setView("detail");
            }
          }}
        />
      );
    }

    if (view === "detail" && selectedOrderId) {
      return selectedOrder ? (
        <OrderDetail
          order={selectedOrder}
          productionTypes={productionTypes}
          onBack={backToList}
        />
      ) : (
        <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-zinc-400 dark:text-zinc-600">
          <p className="text-sm font-semibold mb-2 text-zinc-600 dark:text-zinc-300">
            Data pesanan tidak ditemukan.
          </p>
          <p className="text-xs max-w-xs mx-auto mb-4">
            Pesanan mungkin belum selesai dimuat atau sudah dihapus.
          </p>
          <button
            onClick={backToList}
            className="text-xs font-semibold text-[#124540] dark:text-[#49BFB4] underline underline-offset-2"
          >
            Kembali ke daftar pesanan
          </button>
        </div>
      );
    }

    return (
      <OrderList
        orders={list}
        productionTypes={productionTypes}
        title={kategori === "utama" ? "Pesanan Utama" : "Pesanan Non-Utama"}
        loading={ordersLoading}
        canCreate={
          currentUser.role === "supervisor" || p?.orders?.create === true
        }
        onNewOrder={() => setView("create")}
        onSelectOrder={(id) => {
          setSelectedOrderId(id);
          setView("detail");
        }}
      />
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 flex flex-col md:flex-row font-sans text-zinc-900 dark:text-zinc-100 relative">
      <CustomAlert alertState={alertState} closeAlert={closeAlert} />

      <ProfileModal
        user={currentUser}
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onSave={saveProfile}
      />

      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentUser={currentUser}
        activeTab={activeTab}
        handleNav={(tab: ActiveTab) => {
          setActiveTab(tab);
          setView("list");
          setSelectedOrderId(null);
          setSidebarOpen(false);
        }}
        onLogout={handleLogout}
        onOpenProfile={() => {
          // Tutup sidebar (mode HP) supaya tidak menutupi modal Edit Profil
          setSidebarOpen(false);
          setShowProfileModal(true);
        }}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          currentUser={currentUser}
          onToggleSidebar={() => setSidebarOpen(true)}
          onLogout={handleLogout}
          onOpenProfile={() => setShowProfileModal(true)}
          sidebarOpen={sidebarOpen}
          currentPage={activeTab}
          notifications={notifications}
          onNotificationClick={handleNotificationClick}
          onMarkAllRead={markAllAsRead}
        />

        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto px-4 md:px-6 py-2 md:py-3 pb-32 relative bg-zinc-50 dark:bg-zinc-950 no-scrollbar"
        >
          <div className="w-full h-full">
            {ordersError && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-700 dark:text-red-300">
                <span>{ordersError}</span>
                <button
                  onClick={() => void fetchOrders()}
                  className="font-semibold underline shrink-0"
                >
                  Coba lagi
                </button>
              </div>
            )}

            {/* ── Isi tab ────────────────────────────────────────────────────
                Tambah halaman baru: satu baris di sini, mis.
                {activeTab === "orders" && p?.orders?.view && <OrderList ... />}
                (daftarkan id "orders" dulu di lib/tabs.ts & Sidebar.tsx) */}
            {activeTab === "dashboard" && p?.dashboard?.view && (
              <Dashboard currentUser={currentUser} />
            )}

            {isOrderTab(activeTab) && p?.orders?.view && renderOrders(activeTab)}

            {activeTab === "settings" && p?.settings?.view && (
              <SettingsPage
                currentUser={currentUser}
                productionTypes={productionTypes}
                onSaveProductionType={handleSaveType}
                onToggleProductionType={handleToggleType}
                onDeleteProductionType={handleDeleteType}
                users={usersList}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
              />
            )}

            {activeTab === "about" && <AboutView />}
          </div>
        </main>
      </div>
    </div>
  );
}
