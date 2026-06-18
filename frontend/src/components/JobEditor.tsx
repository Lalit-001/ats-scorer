import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

function ToolButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // Keep the editor selection when clicking the toolbar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        active ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-slate-200" />;
}

/** Minimal rich-text editor for job descriptions: bold, italic, underline,
 *  bullet/numbered lists, undo/redo. Emits HTML via onChange. */
export function JobEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
    ],
    content: value || "",
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class:
          "jd-prose prose prose-sm prose-slate max-w-none min-h-[180px] px-4 py-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor }: { editor: Editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="rounded-lg border border-slate-300 bg-white shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-2 py-1.5">
        <ToolButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolButton>
        <ToolButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolButton>
        <ToolButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="underline">U</span>
        </ToolButton>
        <Divider />
        <ToolButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <span className="font-mono text-xs">1.</span>
        </ToolButton>
        <Divider />
        <ToolButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          ↶
        </ToolButton>
        <ToolButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          ↷
        </ToolButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
