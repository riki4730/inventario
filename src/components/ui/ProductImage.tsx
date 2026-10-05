"use client";

import Image from "next/image";
import { Package } from "lucide-react";

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

export function ProductImage({
  src,
  alt,
  className = "",
  sizes = "96px",
  priority = false,
}: ProductImageProps) {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}
      >
        <Package className="h-1/3 w-1/3 max-h-10 max-w-10" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-50 ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        loading={priority ? undefined : "lazy"}
        priority={priority}
        className="object-cover object-center"
      />
    </div>
  );
}
