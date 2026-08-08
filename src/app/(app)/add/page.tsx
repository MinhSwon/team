import AddPlaceModal from "@/components/AddPlaceModal";
import Navigation from "@/components/Navigation";

export default function AddPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 md:pb-12">
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <AddPlaceModal />
      </main>
    </div>
  );
}
