import ReactMarkdown from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 text-white text-balance">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xl font-semibold mb-3 text-white text-balance">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 text-white text-balance">{children}</h3>,
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        hr: () => <hr className="border-[#2a2a3e] my-4" />,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">{children}</a>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-indigo-500 pl-3 italic text-[#999] mb-3">{children}</blockquote>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return <code className="block bg-[#0a0a12] rounded-lg p-3 mb-3 text-sm overflow-x-auto">{children}</code>;
          }
          return <code className="bg-[#1e1e2e] px-1.5 py-0.5 rounded text-sm text-indigo-300">{children}</code>;
        },
        pre: ({ children }) => <pre className="mb-3">{children}</pre>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
