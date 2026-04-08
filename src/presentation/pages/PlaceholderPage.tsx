interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex items-center justify-center h-full text-gray-500">
      <p className="text-sm">{title} — em breve</p>
    </div>
  );
}
