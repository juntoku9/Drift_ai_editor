"use client";

import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";

interface RichTextEditorProps {
  value: string;
  placeholder?: string;
  onChange: (html: string, plainText: string) => void;
}

function ToolbarButton({
  active,
  label,
  onClick
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
        active
          ? "border-ink/40 bg-ink text-white"
          : "border-ink/20 bg-white/90 text-ink/85 hover:bg-ink/5"
      }`}
    >
      {label}
    </button>
  );
}

export function RichTextEditor({ value, placeholder, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3]
        }
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Write your document..."
      })
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[560px] rounded-b-2xl border border-t-0 border-ink/10 bg-white px-8 py-7 focus:outline-none md:min-h-[640px]"
      }
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getHTML(), nextEditor.getText().trim());
    }
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2 rounded-t-2xl border border-ink/10 bg-paper px-4 py-3">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="H2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          label="Bullet List"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbered List"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
