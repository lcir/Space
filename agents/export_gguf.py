"""Export a fused Qwen2 model (Hugging Face safetensors from mlx_lm fuse) to an F16 GGUF that Ollama can run.

Ollama cannot run imported Qwen2 safetensors, and llama.cpp's converter needs PyTorch. The metadata and tokenizer
are copied from the reference GGUF of the same base model (the qwen2.5:0.5b blob in Ollama); only the weights change.
Usage: .venv/bin/python agents/export_gguf.py <fused-dir> <reference.gguf> <out.gguf>
"""
import re
import sys
from pathlib import Path

import gguf
import mlx.core as mx
import numpy as np

LAYER = {'input_layernorm.weight': 'attn_norm.weight', 'post_attention_layernorm.weight': 'ffn_norm.weight',
         'self_attn.o_proj.weight': 'attn_output.weight', 'mlp.gate_proj.weight': 'ffn_gate.weight',
         'mlp.up_proj.weight': 'ffn_up.weight', 'mlp.down_proj.weight': 'ffn_down.weight',
         **{f'self_attn.{p}_proj.{kind}': f'attn_{p}.{kind}' for p in 'qkv' for kind in ('weight', 'bias')}}


def gguf_name(name):
    if name == 'model.embed_tokens.weight': return 'token_embd.weight'
    if name == 'model.norm.weight': return 'output_norm.weight'
    if name == 'lm_head.weight': return None  # Qwen2.5-0.5B ties output and input embeddings.
    match = re.fullmatch(r'model\.layers\.(\d+)\.(.+)', name)
    if not match or match[2] not in LAYER: raise ValueError(f'Unexpected tensor {name}')
    return f'blk.{match[1]}.{LAYER[match[2]]}'


def main(fused, reference, out):
    ref = gguf.GGUFReader(reference)
    shapes = {t.name: list(reversed([int(n) for n in t.shape])) for t in ref.tensors}
    weights = {}
    for file in sorted(Path(fused).glob('*.safetensors')):
        for name, value in mx.load(str(file)).items():
            target = gguf_name(name)
            if target is None: continue
            # llama.cpp keeps 1-D norms and biases in F32.
            weights[target] = np.array(value.astype(mx.float32 if value.ndim == 1 else mx.float16))
    if weights.keys() != shapes.keys(): raise ValueError(f'Tensor mismatch: missing {sorted(shapes.keys() - weights.keys())[:5]}, extra {sorted(weights.keys() - shapes.keys())[:5]}')
    for name, value in weights.items():
        if list(value.shape) != shapes[name]: raise ValueError(f'{name}: shape {value.shape} differs from reference {shapes[name]}')
    # A wrong mapping or transposition would make weights unrelated to the reference, even after fine-tuning.
    for name in ('blk.0.attn_q.weight', 'blk.12.ffn_down.weight', 'blk.23.attn_v.weight'):
        tensor = next(t for t in ref.tensors if t.name == name)
        a, b = gguf.quants.dequantize(tensor.data, tensor.tensor_type).ravel(), weights[name].astype(np.float32).ravel()
        similarity = float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))
        if similarity < .9: raise ValueError(f'{name} does not match the reference model (cosine {similarity:.3f})')
    writer = gguf.GGUFWriter(out, arch=ref.fields['general.architecture'].contents())
    for key, field in ref.fields.items():
        if key.startswith('GGUF.') or key in ('general.architecture', 'general.file_type', 'general.quantization_version'): continue
        value = field.contents()
        if key == 'general.name': value = 'Space Invaders pilot'
        writer.add_key_value(key, value, field.types[0], field.types[-1] if field.types[0] == gguf.GGUFValueType.ARRAY else None)
    writer.add_file_type(gguf.LlamaFileType.MOSTLY_F16)
    for t in ref.tensors: writer.add_tensor(t.name, weights[t.name])
    writer.write_header_to_file(); writer.write_kv_data_to_file(); writer.write_tensors_to_file(); writer.close()
    print(f'Wrote {out} ({len(weights)} tensors)')


if __name__ == '__main__':
    if len(sys.argv) != 4: sys.exit(__doc__)
    main(*sys.argv[1:])
