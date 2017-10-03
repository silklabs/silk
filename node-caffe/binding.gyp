{
  'variables': {
    'library_type%': 'loadable_module',
  },
  'targets': [
    {
      'target_name': 'caffe',
      'type': '<(library_type)',
      'sources': [
        'src/caffe.cpp'
      ],
      'variables': {
        'has_gpu': '<!(if which nvidia-smi; then echo true; else echo false; fi)',
      },
      'include_dirs': [
        '<!(node -e "require(\'nan\')")',
        '<!(echo $CAFFE_ROOT/include)',
        '/usr/local/cuda/include/',
        '<!(pwd)/caffe/src/',
        '<!(pwd)/caffe/include/',
        '<!(pwd)/caffe/build/include/',
      ],
      'libraries': [
        '-L<!(echo "$CAFFE_ROOT/lib")',
        '-L<!(pwd)/caffe/build/lib',
        '<!(if [ "<(has_gpu)" != false ] && [ -d /usr/local/cuda/lib ]; then echo "-L/usr/local/cuda/lib"; fi)',
        '<!(if [ "<(has_gpu)" != false ] && [ -d /usr/local/cuda/lib64 ]; then echo "-L/usr/local/cuda/lib64"; fi)',
        '<!(if [ "<(has_gpu)" != false ] && [ -d /usr/local/cuda ]; then echo "-lcudart"; fi)',
        '-lcaffe',
      ],
      'ldflags': [
        '-Wl,-rpath,<!(echo $CAFFE_ROOT/lib)',
        '-Wl,-rpath,<!(pwd)/caffe/build/lib',
        '<!(if [ "<(has_gpu)" != false ] && [ -d /usr/local/cuda/lib ]; then echo "-Wl,-rpath,/usr/local/cuda/lib"; fi)',
        '<!(if [ "<(has_gpu)" != false ] && [ -d /usr/local/cuda/lib64 ]; then echo "-Wl,-rpath,/usr/local/cuda/lib64"; fi)',
      ],
      'cflags_cc': [
        '-std=c++11',
        '-fexceptions',
        '-Wno-ignored-qualifiers',
      ],
      'defines': [
        '<!(if [ "<(has_gpu)" != false ]; then echo "HAVE_CUDA"; else echo "CPU_ONLY"; fi)',
      ],
      'conditions': [
        ['OS=="win"', {
          'dependencies': [
          ]
        }],
        ['OS=="mac"', {
          'defines': [
            '<!(if [ "<(has_gpu)" != false ]; then echo "HAVE_CUDA"; else echo "CPU_ONLY"; fi)',
          ],
          'include_dirs': [
            '<!(brew --prefix openblas)' + '/include',
            '<!(brew --prefix boost 2> /dev/null)' + '/include',
            '<!(brew --prefix gflags)' + '/include',
            '<!(brew --prefix glog)' + '/include',
            '<!(brew --prefix protobuf)' + '/include',
          ],
          'libraries': [
            '<!(brew --prefix boost 2> /dev/null)' + '/lib/libopencv_core.dylib',
            '-lboost_system',
            '-lboost_thread-mt',
          ],
          'xcode_settings': {
            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
            'GCC_ENABLE_CPP_RTTI': 'YES',
            'MACOSX_DEPLOYMENT_TARGET': '10.11',
            'OTHER_LDFLAGS': [
              '-Wl,-rpath,<!(echo $CAFFE_ROOT/lib)',
              '-Wl,-rpath,<!(pwd)/caffe/build/lib',
              '<!(if [ "<(has_gpu)" != false ] && [ -d /usr/local/cuda/lib ]; then echo "-Wl,-rpath,/usr/local/cuda/lib"; fi)',
              '<!(if [ "<(has_gpu)" != false ] && [ -d /usr/local/cuda/lib64 ]; then echo "-Wl,-rpath,/usr/local/cuda/lib64"; fi)',
            ],
          },
          'libraries': [
          ],
        }]
      ]
    }
  ]
}
