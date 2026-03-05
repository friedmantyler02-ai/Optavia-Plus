"use client"

import Link from 'next/link'

export default function PageHeader({ title, subtitle, breadcrumbs, actions }) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 mb-2">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1
            return (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">&#8250;</span>}
                {isLast ? (
                  <span className="text-sm text-gray-400">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="text-sm text-gray-400 hover:text-gray-600">
                    {crumb.label}
                  </Link>
                )}
              </span>
            )
          })}
        </nav>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="mt-3 sm:mt-0">{actions}</div>
        )}
      </div>
    </div>
  )
}
